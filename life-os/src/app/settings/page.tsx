import { SettingsView } from "@/components/settings-view";
import { getSettingsView } from "@/lib/views";
export const dynamic = "force-dynamic";
export default function Page() { return <SettingsView data={getSettingsView()} />; }
