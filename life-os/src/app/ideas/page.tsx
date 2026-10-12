import { IdeasView } from "@/components/ideas-view";
import { getIdeasView } from "@/lib/views";
export const dynamic = "force-dynamic";
export default function Page() { return <IdeasView data={getIdeasView()} />; }
