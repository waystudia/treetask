interface TreeStagePreviewProps {
  stage: number;
  outcomeLayer: number;
  label: string;
  description: string;
  variant?: "start" | "current" | "goal";
}

export function TreeStagePreview({
  stage,
  outcomeLayer,
  label,
  description,
  variant = "current",
}: TreeStagePreviewProps) {
  const safeStage = Math.min(20, Math.max(0, Math.round(stage)));
  const safeOutcomeLayer = Math.min(5, Math.max(0, Math.round(outcomeLayer)));
  const treeColumn = safeStage % 7;
  const treeRow = Math.floor(safeStage / 7);
  const treePositionX = (treeColumn / 6) * 100;
  const treePositionY = (treeRow / 2) * 100;

  return (
    <figure className={`tree-stage-preview ${variant}`}>
      <figcaption><strong>{label}</strong><span>{safeStage} из 20</span></figcaption>
      <div className="tree-preview-art">
        <div
          className="tree-stage-sprite"
          role="img"
          aria-label={description}
          style={{ backgroundPosition: `${treePositionX}% ${treePositionY}%` }}
        />
        {safeOutcomeLayer > 0 ? (
          <div className={`fruit-layer fruit-layer-${safeOutcomeLayer}`} aria-hidden="true">
            {Array.from({ length: safeOutcomeLayer * 3 }, (_, index) => <span key={index} />)}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
