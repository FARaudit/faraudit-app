// CANONICAL pipeline stage vocabulary.
//
// The lifecycle codes were previously spelled out in four uncoordinated places
// (the pipeline API route, the Opportunities client, public/pipeline-live.js's
// STAGE_LABELS, and command-center-data's STAGE_TO_BUCKET) while the repo's
// migration still named a different set entirely. This module is the one
// definition; 20260729190000_pipeline_stage_codes.sql aligns the DB constraint
// with it.

export const PIPELINE_STAGES = {
  "01": "Pre-Sol Synopsis",
  "02": "Sources Sought",
  "03": "Solicitation",
  "04": "Proposal Dev",
  "05": "Submission",
  "06": "Evaluation",
  "07": "Award",
  "08": "Post-Award",
} as const;

export type PipelineStage = keyof typeof PIPELINE_STAGES;

// Capture stages: a pursuit here is still just "tracked". The Opportunities
// Pipeline toggle may add and remove these; once a pursuit advances past them
// the user has done real work on it, so a toggle must never delete it.
export const CAPTURE_STAGES: PipelineStage[] = ["01", "02", "03"];

export function isPipelineStage(v: unknown): v is PipelineStage {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PIPELINE_STAGES, v);
}

// The Opportunities lane keys (dso-app.js stage vocabulary) → capture stage.
// Anything else lands on '03' (an open solicitation), the safe default for a
// notice the user is choosing to track.
export function captureStageForLane(lane: string | null | undefined): PipelineStage {
  if (lane === "presol") return "01";
  if (lane === "sources") return "02";
  return "03";
}
