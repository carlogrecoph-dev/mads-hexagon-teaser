import { HEX } from "@/engine/config";
import { publicUrl } from "@/lib/asset";
import { VrmFigure } from "./VrmFigure";
import { useStudio } from "@/store/studio";

export function Character() {
  const include = useStudio((s) => s.settings.includeCharacter);
  const vrmUrl = useStudio((s) => s.identity.vrmUrl);
  const bundled = publicUrl("models/female.vrm?v=op");
  const url = !vrmUrl || /female\.vrm/.test(vrmUrl) ? bundled : vrmUrl;
  if (!include) return null;
  return (
    <group position={[0, 0, HEX.personZ]}>
      <VrmFigure url={url} />
    </group>
  );
}
