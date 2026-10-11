import { HabitsView } from "@/components/habits-view";
import { getHabitsView } from "@/lib/views";
export const dynamic = "force-dynamic";
export default function Page() { return <HabitsView data={getHabitsView()} />; }
