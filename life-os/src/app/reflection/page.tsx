import { ReflectionView } from "@/components/reflection-view";
import { getReflectionView } from "@/lib/views";
export const dynamic = "force-dynamic";
export default function Page() { return <ReflectionView data={getReflectionView()} />; }
