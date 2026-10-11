import OpenAI from "openai";
import { describeAction, interpret } from "@/lib/parser";
import { energyFromText, REFLECTION_QUESTIONS, summarizeReflection } from "@/lib/reflection";
import {
  addMessage,
  createProposal,
  getConversation,
  getProposal,
  getUser,
  latestConversation,
  listMessages,
  loadContext,
  saveReflection,
  setConversationMode,
  type ConversationRow,
} from "@/lib/store";
import { normalizeText } from "@/lib/text";
import { addDaysKey, periodKey, todayKey, zonedDate } from "@/lib/time";
import type { Action, InterpContext, ReflectionPeriod } from "@/lib/types";

const TOOL_NAMES = [
  "createTask",
  "updateTask",
  "completeTask",
  "rescheduleTask",
  "createIdea",
  "createEvent",
  "updateEvent",
  "completeHabit",
  "setHabitStatus",
  "startReflection",
  "generateDailyPlan",
  "generateWeeklyPlan",
  "updateGoalProgress",
  "proposeScheduleChanges",
] as const;

function tool(name: string, description: string) {
  return {
    type: "function" as const,
    function: {
      name,
      description,
      parameters: { type: "object", additionalProperties: true },
    },
  };
}

function sanitize(actions: Action[], text: string, ctx: InterpContext) {
  const normalized = normalizeText(text);
  const completion = /успел|успела|сделал|сделала|сходил|сходила|отметь|готово|закончил|закончила|была в зале|был в зале/.test(normalized);
  const idea = /иде[яюи]|придумал|придумала/.test(normalized);
  const progress = /прогресс|показател|обнови/.test(normalized) || /\d/.test(text);
  const clean: Action[] = [];
  for (const action of actions) {
    if ((action.type === "completeTask" || action.type === "completeHabit") && !completion) continue;
    if (action.type === "completeTask" && !ctx.tasks.some((task) => task.id === action.taskId && task.status === "open")) continue;
    if (action.type === "completeHabit" && !ctx.habits.some((habit) => habit.id === action.habitId)) continue;
    if (action.type === "rescheduleTask" && !ctx.tasks.some((task) => task.id === action.taskId)) continue;
    if (action.type === "updateGoalProgress" && (!progress || !ctx.goals.some((goal) => goal.id === action.goalId))) continue;
    if (action.type === "createTask" && idea && !/задач/.test(normalized)) {
      clean.push({
        type: "createIdea",
        title: action.title,
        description: action.notes,
        recommendation: "Это идея, не обязательство. В задачи не ставлю.",
      });
      continue;
    }
    if (action.type === "startReflection" || action.type === "generateDailyPlan" || action.type === "generateWeeklyPlan") continue;
    clean.push(action);
  }
  return clean;
}

async function askOpenAI(text: string, ctx: InterpContext, history: { role: string; content: string }[]) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const context = {
    timezone: ctx.tz,
    goals: ctx.goals.map((goal) => ({ id: goal.id, title: goal.title, horizon: goal.horizon })),
    tasks: ctx.tasks.filter((task) => task.status === "open").map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt, goal: task.goalTitle })),
    events: ctx.events.slice(0, 20),
    habits: ctx.habits,
    habitLogs: ctx.habitLogs,
    ideas: ctx.ideas.slice(0, 20),
    loggedMinutesByArea: ctx.loggedMinutesByArea,
    energy: ctx.energy,
  };
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `Ты помощник Life OS одного человека. Отвечай по-русски, коротко и спокойно.
Не выдумывай выполненные задачи, события, деньги и эмоции. Если факта нет в контексте, так и скажи.
Цели человека не переименовывай. Идеи не превращай в задачи. Существенные изменения оформляй только tool calling, их ещё подтвердит человек.
Обязательства с финансовым риском важнее идей.
Контекст JSON: ${JSON.stringify(context).slice(0, 12000)}`,
      },
      ...history.slice(-10).map((message) => ({
        role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: message.content,
      })),
      { role: "user", content: text },
    ],
    tools: TOOL_NAMES.map((name) => tool(name, name)),
  });
  const message = response.choices[0]?.message;
  const actions: Action[] = [];
  for (const call of message?.tool_calls ?? []) {
    if (call.type !== "function") continue;
    try {
      actions.push({ type: call.function.name, ...JSON.parse(call.function.arguments || "{}") } as Action);
    } catch {
      continue;
    }
  }
  return { reply: message?.content?.trim() || "", actions };
}

function beginReflection(conversationId: string, period: ReflectionPeriod) {
  const tz = getUser().timezone;
  const today = todayKey(new Date(), tz);
  setConversationMode(conversationId, "reflection", {
    period,
    step: 0,
    answers: {},
    periodKey: periodKey(today, period, tz),
  });
  return REFLECTION_QUESTIONS[period][0].prompt;
}

function continueReflection(conversation: ConversationRow, text: string) {
  const state = JSON.parse(conversation.modeStateJson || "{}") as {
    period: ReflectionPeriod;
    step: number;
    answers: Record<string, string>;
    periodKey: string;
  };
  if (/^отмена$/i.test(text.trim())) {
    setConversationMode(conversation.id, null, null);
    return { reply: "Рефлексию остановила. Черновик не сохраняю.", proposal: null as null };
  }
  const questions = REFLECTION_QUESTIONS[state.period];
  const current = questions[state.step];
  if (!current) {
    setConversationMode(conversation.id, null, null);
    return { reply: "Эта рефлексия уже завершена.", proposal: null };
  }
  state.answers[current.key] = text.trim();
  state.step += 1;
  if (state.step < questions.length) {
    setConversationMode(conversation.id, "reflection", state);
    return { reply: questions[state.step].prompt, proposal: null };
  }
  const summary = summarizeReflection(state.period, state.answers);
  const energy = energyFromText(state.answers.feeling) ?? energyFromText(state.answers.energy) ?? energyFromText(state.answers.state);
  saveReflection({ period: state.period, periodKey: state.periodKey, answers: state.answers, summary, energy, actor: "user" });
  setConversationMode(conversation.id, null, null);
  const actions: Action[] = [];
  const tomorrow = state.answers.tomorrow?.trim();
  if (tomorrow) {
    const tz = getUser().timezone;
    const day = addDaysKey(todayKey(new Date(), tz), 1, tz);
    actions.push({
      type: "createTask",
      title: tomorrow.slice(0, 180),
      notes: "Из ежедневной рефлексии. Можно переименовать до подтверждения.",
      dueAt: zonedDate(day, "18:00", tz).toISOString(),
      priority: "normal",
    });
  }
  const proposal = actions.length
    ? createProposal({
        conversationId: conversation.id,
        summary: "Завтрашний фокус из ваших слов. В календарь само не встанет.",
        actions,
      })
    : null;
  const extra = proposal ? "\n\nМогу сделать из вашего «важного завтра» задачу. Это отдельное подтверждение, само не сохраню." : "";
  return { reply: `Сохранила рефлексию. Ниже только ваши ответы.\n\n${summary}${extra}`, proposal };
}

export async function answerMessage(conversationId: string | undefined, text: string) {
  const conversation = conversationId ? getConversation(conversationId) : latestConversation();
  addMessage(conversation.id, "user", text);
  if (conversation.mode === "reflection") {
    const result = continueReflection(conversation, text);
    addMessage(conversation.id, "assistant", result.reply);
    return { conversationId: conversation.id, reply: result.reply, proposal: result.proposal, mode: "local" as const };
  }

  const ctx = loadContext();
  const local = interpret(text, ctx);
  let actions = local.actions;
  let reply = local.reply;
  let mode: "local" | "openai" | "fallback" = "local";
  let setupHint: string | undefined;

  if (!process.env.OPENAI_API_KEY) {
    setupHint = "Облачный AI не подключён: фразу разбирает локальный помощник. Ключ OpenAI задаётся на сервере в OPENAI_API_KEY и в браузер не отправляется.";
  } else {
    try {
      const history = listMessages(conversation.id);
      const remote = await askOpenAI(text, ctx, history);
      const sanitized = sanitize(remote.actions, text, ctx);
      mode = "openai";
      if (!local.actions.length && sanitized.length) {
        actions = sanitized;
        reply = remote.reply || local.reply;
      } else if (!local.actions.length && remote.reply) {
        reply = remote.reply;
      }
    } catch (error) {
      mode = "fallback";
      setupHint = `Облачный AI сейчас недоступен (${error instanceof Error ? error.message : "ошибка"}). Разобрала сообщение локально.`;
    }
  }

  if (local.immediate.some((action) => action.type === "startReflection")) {
    const period = local.immediate.find((action) => action.type === "startReflection");
    if (period && period.type === "startReflection") {
      const prompt = beginReflection(conversation.id, period.period);
      reply = `${reply}\n\n${prompt}`;
    }
  }

  const proposal = actions.length ? createProposal({ conversationId: conversation.id, summary: reply, actions }) : null;
  const full = [setupHint, reply].filter(Boolean).join("\n\n");
  addMessage(conversation.id, "assistant", full);
  return {
    conversationId: conversation.id,
    reply: full,
    proposal: proposal
      ? { ...proposal, lines: actions.map((action) => describeAction(action, ctx)) }
      : null,
    mode,
  };
}

export function proposalView(id: string, ctx = loadContext()) {
  const proposal = getProposal(id);
  const actions = JSON.parse(proposal.actionsJson) as Action[];
  return { proposal, actions, lines: actions.map((action) => describeAction(action, ctx)) };
}
