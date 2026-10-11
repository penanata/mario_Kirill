import { reconcileHabit } from "@/lib/habits";
import {
  createEvent,
  createIdea,
  createTask,
  finishProposal,
  getProposal,
  getTask,
  getUser,
  listEvents,
  listHabitLogs,
  listHabits,
  recordGoalProgress,
  replacePlannedLogs,
  updateEvent,
  updateTask,
  upsertHabitLog,
} from "@/lib/store";
import { monthBounds, nowISO, todayKey } from "@/lib/time";
import type { Action } from "@/lib/types";
import { HttpError } from "@/lib/utils";
import { getDb } from "@/lib/db";

function placeTask(taskId: string, title: string, start: string, end: string, actor: string) {
  const linked = listEvents().find((event) => event.taskId === taskId);
  if (linked) return updateEvent(linked.id, { title, startAt: start, endAt: end }, actor);
  return createEvent({ title, startAt: start, endAt: end, taskId, source: "local", actor }).event;
}

function applyOne(action: Action, actor: string) {
  switch (action.type) {
    case "completeTask": {
      const task = getTask(action.taskId);
      if (task.status === "done") return `«${task.title}» уже была выполнена. Повторно не отмечаю.`;
      updateTask(task.id, { status: "done", completedAt: nowISO() }, actor);
      return `Сохранено: «${task.title}» выполнена.`;
    }
    case "cancelTask": {
      const task = getTask(action.taskId);
      updateTask(task.id, { status: "cancelled" }, actor);
      return `«${task.title}» отменена.`;
    }
    case "createTask": {
      const created = createTask({ ...action, source: "ai", actor });
      return created.duplicate ? `Задача «${created.task.title}» уже есть. Дубликат не создаю.` : `Создана задача «${created.task.title}».`;
    }
    case "updateTask": {
      const task = updateTask(action.taskId, action.patch, actor);
      return `Задача «${task.title}» обновлена.`;
    }
    case "rescheduleTask": {
      const task = getTask(action.taskId);
      if (action.requiresDecision && !action.decision) {
        throw new HttpError("Выберите, что сделать: перенести, сократить, делегировать или отменить.");
      }
      if (action.decision === "cancel") {
        updateTask(task.id, { status: "cancelled" }, actor);
        return `«${task.title}» отменена по вашему решению, а не перенесена снова.`;
      }
      if (action.decision === "delegate") {
        updateTask(task.id, { status: "delegated", notes: task.notes }, actor);
        return `«${task.title}» отмечена к делегированию. В календарь она больше не стоит как ваша работа.`;
      }
      const estimate = action.decision === "shrink" ? Math.min(task.estimateMinutes ?? 45, 45) : task.estimateMinutes;
      const rescheduleCount = action.countsAsReschedule === false ? task.rescheduleCount : task.rescheduleCount + 1;
      updateTask(
        task.id,
        { scheduledStart: action.start, scheduledEnd: action.end, estimateMinutes: estimate, rescheduleCount, status: "open" },
        actor,
      );
      placeTask(task.id, task.title, action.start, action.end, actor);
      return action.decision === "shrink"
        ? `«${task.title}» сокращена и поставлена на новое время.`
        : `«${task.title}» перенесена. Это перенос номер ${rescheduleCount}.`;
    }
    case "proposeScheduleChanges": {
      const lines: string[] = [];
      for (const move of action.moves) {
        const task = getTask(move.taskId);
        const count = task.scheduledStart ? task.rescheduleCount + 1 : task.rescheduleCount;
        updateTask(task.id, { scheduledStart: move.start, scheduledEnd: move.end, rescheduleCount: count }, actor);
        placeTask(task.id, task.title, move.start, move.end, actor);
        lines.push(`«${task.title}» стоит в календаре.`);
      }
      return lines.join(" ");
    }
    case "createIdea": {
      const created = createIdea({
        title: action.title,
        description: action.description,
        areaId: action.areaId,
        goalId: action.goalId,
        uncertainty: action.uncertainty,
        nextStep: action.nextStep,
        recommendation: action.recommendation,
        relatedIdeaId: action.relatedIdeaId,
        confirmed: true,
        status: "new",
        actor,
      });
      return created.duplicate
        ? `Идея «${created.idea.title}» уже в банке. Вторую копию не добавляю и в задачи не превращаю.`
        : `Идея «${created.idea.title}» в банке идей. В задачи она не попала.`;
    }
    case "createEvent": {
      const created = createEvent({
        title: action.title,
        startAt: action.start,
        endAt: action.end,
        notes: action.notes,
        location: action.location,
        secondaryTz: action.secondaryTz,
        actor,
      });
      return created.duplicate ? `Событие «${action.title}» на это время уже есть.` : `В локальный календарь добавлено: «${action.title}».`;
    }
    case "updateEvent": {
      const event = updateEvent(action.eventId, action.patch, actor);
      return `Событие «${event.title}» обновлено.`;
    }
    case "completeHabit": {
      const habit = listHabits().find((item) => item.id === action.habitId);
      if (!habit) throw new HttpError("Привычка не найдена", 404);
      const existing = listHabitLogs(habit.id, action.date, action.date)[0];
      if (existing?.status === "done") return `Посещение ${action.date} уже засчитано. Второй раз не добавляю.`;
      upsertHabitLog(habit.id, action.date, "done", action.note, actor);
      const tz = getUser().timezone;
      const today = todayKey(new Date(), tz);
      const bounds = monthBounds(today);
      const logs = listHabitLogs(habit.id, bounds.start, bounds.end);
      const plan = reconcileHabit({
        monthDay: today,
        today,
        tz,
        target: habit.targetCount,
        preferredGapDays: habit.preferredGapDays,
        logs,
      });
      replacePlannedLogs(habit.id, plan.futureDates, today);
      return `Тренировка ${action.date} засчитана. Прогресс месяца: ${plan.doneCount} из ${plan.target}.`;
    }
    case "setHabitStatus": {
      const habit = listHabits().find((item) => item.id === action.habitId);
      if (!habit) throw new HttpError("Привычка не найдена", 404);
      const tz = getUser().timezone;
      const userToday = todayKey(new Date(), tz);
      const bounds = monthBounds(userToday);
      const currentLogs = listHabitLogs(habit.id, bounds.start, bounds.end).map((log) =>
        log.date === action.date ? { ...log, status: action.status } : log,
      );
      if (!currentLogs.some((log) => log.date === action.date)) currentLogs.push({ id: "tmp", habitId: habit.id, date: action.date, status: action.status, note: null });
      const plan = reconcileHabit({
        monthDay: userToday,
        today: userToday,
        tz,
        target: habit.targetCount,
        preferredGapDays: habit.preferredGapDays,
        logs: currentLogs,
      });
      if (action.futureDates?.length) {
        const proposed = [...action.futureDates].sort().join(",");
        const fresh = [...plan.futureDates].sort().join(",");
        if (proposed !== fresh) throw new HttpError("Календарь привычки уже изменился. Откройте предложение ещё раз.");
      }
      upsertHabitLog(habit.id, action.date, action.status, action.note, actor);
      if (action.status === "missed") replacePlannedLogs(habit.id, plan.futureDates, userToday);
      return action.status === "missed"
        ? `Пропуск ${action.date} сохранён. В зачёт он не идёт: ${plan.doneCount} из ${plan.target}. Новые дни: ${plan.futureDates.join(", ")}.`
        : `Статус ${action.date} обновлён.`;
    }
    case "updateGoalProgress": {
      const goal = recordGoalProgress(action.goalId, action.value, action.note, actor);
      return `Показатель «${goal.title}» теперь ${action.value}. Название цели не менялось.`;
    }
    case "startReflection":
      return "Рефлексия начата.";
    case "generateDailyPlan":
    case "generateWeeklyPlan":
      return "План показан в ответе, без скрытых изменений.";
    default:
      return "Действие пропущено.";
  }
}

export function applyProposal(id: string) {
  const proposal = getProposal(id);
  if (proposal.status !== "pending") throw new HttpError("Это предложение уже закрыто");
  const actions = JSON.parse(proposal.actionsJson) as Action[];
  const db = getDb();
  const lines: string[] = [];
  db.exec("BEGIN");
  try {
    for (const action of actions) lines.push(applyOne(action, "user"));
    db.prepare("UPDATE ai_action_proposals SET status = ?, result_json = ?, resolved_at = ? WHERE id = ?").run(
      "confirmed",
      JSON.stringify({ lines }),
      nowISO(),
      id,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { lines, proposal: getProposal(id) };
}

export function cancelProposal(id: string) {
  const proposal = getProposal(id);
  if (proposal.status !== "pending") throw new HttpError("Это предложение уже закрыто");
  return finishProposal(id, "cancelled", { lines: ["Ничего не изменено."] });
}
