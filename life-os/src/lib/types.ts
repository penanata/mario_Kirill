export type Horizon = "life" | "year" | "quarter" | "month" | "week";
export type TaskStatus = "open" | "done" | "cancelled" | "deferred" | "delegated";
export type Priority = "low" | "normal" | "high" | "obligation";
export type Energy = "low" | "medium" | "high";
export type HabitStatus = "planned" | "done" | "missed" | "rescheduled";
export type IdeaStatus = "new" | "research" | "planned" | "experiment" | "deferred" | "rejected" | "done";
export type ReflectionPeriod = "day" | "week" | "month" | "quarter" | "year";

export type Action =
  | {
      type: "createTask";
      title: string;
      notes?: string;
      estimateMinutes?: number;
      dueAt?: string | null;
      scheduledStart?: string | null;
      scheduledEnd?: string | null;
      goalId?: string | null;
      areaId?: string | null;
      priority?: Priority;
      financialRisk?: boolean;
      outcome?: string;
    }
  | { type: "updateTask"; taskId: string; patch: Record<string, unknown> }
  | { type: "completeTask"; taskId: string }
  | {
      type: "rescheduleTask";
      taskId: string;
      start: string;
      end: string;
      reason: string;
      requiresDecision?: boolean;
      decision?: "move" | "shrink" | "cancel" | "delegate";
      countsAsReschedule?: boolean;
    }
  | {
      type: "createIdea";
      title: string;
      description?: string;
      areaId?: string | null;
      goalId?: string | null;
      uncertainty?: "low" | "medium" | "high";
      nextStep?: string;
      recommendation?: string;
      relatedIdeaId?: string | null;
    }
  | {
      type: "createEvent";
      title: string;
      start: string;
      end: string;
      notes?: string;
      location?: string;
      secondaryTz?: string | null;
    }
  | { type: "updateEvent"; eventId: string; patch: Record<string, unknown> }
  | { type: "completeHabit"; habitId: string; date: string; note?: string }
  | {
      type: "setHabitStatus";
      habitId: string;
      date: string;
      status: "missed" | "planned" | "rescheduled";
      futureDates?: string[];
      note?: string;
    }
  | { type: "startReflection"; period: ReflectionPeriod }
  | { type: "generateDailyPlan" }
  | { type: "generateWeeklyPlan" }
  | { type: "updateGoalProgress"; goalId: string; value: number; note?: string }
  | {
      type: "proposeScheduleChanges";
      moves: { taskId: string; start: string; end: string; reason: string }[];
    }
  | { type: "cancelTask"; taskId: string; reason?: string };

export type InterpTask = {
  id: string;
  title: string;
  status: string;
  estimateMinutes: number | null;
  rescheduleCount: number;
  goalId: string | null;
  goalTitle: string | null;
  areaId: string | null;
  dueAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  financialRisk: boolean;
  priority: string;
};

export type InterpContext = {
  now: string;
  tz: string;
  tasks: InterpTask[];
  habits: { id: string; name: string; goalId: string | null; targetCount: number; preferredGapDays: number }[];
  habitLogs: { habitId: string; date: string; status: string }[];
  events: { id: string; title: string; startAt: string; endAt: string }[];
  ideas: { id: string; title: string; status: string }[];
  goals: { id: string; title: string; horizon: string; areaId: string | null; parentId: string | null; metricMode: string }[];
  areas: { id: string; name: string; slug: string }[];
  loggedMinutesByArea: Record<string, number>;
  energy: number | null;
  freeMinutes: number;
};

export type Interpretation = {
  reply: string;
  actions: Action[];
  immediate: Action[];
};
