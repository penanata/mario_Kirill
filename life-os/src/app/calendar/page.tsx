import { CalendarView } from "@/components/calendar-view";
import { getCalendarView } from "@/lib/views";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  return <CalendarView data={getCalendarView(day)} />;
}
