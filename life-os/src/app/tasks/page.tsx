import { TasksView } from "@/components/tasks-view";
import { getTasksView } from "@/lib/views";

export const dynamic = "force-dynamic";
export default function Page() {
  return <TasksView data={getTasksView()} />;
}
