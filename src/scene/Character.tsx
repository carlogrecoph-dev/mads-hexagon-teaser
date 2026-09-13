import { HEX } from "@/engine/config";
import { publicUrl } from "@/lib/asset";
import { VrmFigure } from "./VrmFigure";

export function Character() {
  const bundled = publicUrl("models/female.vrm?v=open1");
  return (
    <group position={[0, 0, HEX.personZ]}>
      <VrmFigure url={bundled} />
    </group>
  );
}
