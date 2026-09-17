import type { WidgetType } from '@openmaic/dsl';

export type { WidgetType } from '@openmaic/dsl';

/** Image extracted from a source document with metadata used by outline prompts. */
export interface PdfImage {
  id: string;
  src: string;
  pageNumber: number;
  description?: string;
  storageId?: string;
  width?: number;
  height?: number;
  originalId?: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  sourceDocumentOrder?: number;
  visionPriority?: number;
}

export type ImageMapping = Record<string, string>;

/** Free-form requirements accepted by outline generation. */
export interface UserRequirements {
  requirement: string;
  userNickname?: string;
  userBio?: string;
  webSearch?: boolean;
  interactiveMode?: boolean;
  taskEngineMode?: boolean;
}

export interface WidgetOutline {
  concept?: string;
  keyVariables?: string[];
  diagramType?: 'flowchart' | 'mindmap' | 'hierarchy' | 'system';
  language?: 'python' | 'javascript' | 'typescript' | 'java' | 'cpp';
  gameType?: 'quiz' | 'puzzle' | 'strategy' | 'card' | 'action';
  visualizationType?: 'molecular' | 'solar' | 'anatomy' | 'geometry' | 'physics' | 'custom';
  objects?: string[];
  interactions?: string[];
  procedureType?: 'repair' | 'assembly' | 'inspection' | 'operation' | 'custom';
  task?: string;
  tools?: string[];
  steps?: string[];
  successCriteria?: string[];
  errorConsequences?: string[];
  challenge?: string;
  playerControls?: string[];
  nodeCount?: number;
  nodes?: Array<{
    id: string;
    label: string;
    parentId?: string;
    icon?: string;
    details?: string;
  }>;
  challengeType?: string;
}

export interface MediaGenerationRequest {
  type: 'image' | 'video';
  prompt: string;
  elementId: string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16';
  style?: string;
}

/** A generation-ready description of one course scene.
 *
 * Beyond identification (title/description/keyPoints), an outline is a
 * detailed design blueprint: the design fields below carry the teaching
 * decisions Stage 2 executes instead of inventing. All design fields are
 * optional so outlines from older producers keep working.
 */
export interface SceneOutline {
  id: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  title: string;
  description: string;
  keyPoints: string[];
  teachingObjective?: string;
  estimatedDuration?: number;
  order: number;
  languageNote?: string;
  /** One-sentence narrative script: tension hook → aha turn → term naming. */
  teachingNarrative?: string;
  /** Must-teach propositions, quoted concretely (figures, standards, clauses). */
  mustCover?: string[];
  /** Anticipated misconceptions, each paired with its decidable criterion. */
  misconceptions?: string[];
  /** The example or case this scene uses (echoes the course running example). */
  exampleCase?: string;
  /** Handoff line from the previous scene. */
  transitionIn?: string;
  /** Quiz-only: which teaching points each question assesses, in order. */
  assessmentMap?: string[];
  /**
   * Verbatim passages from the source material this scene teaches.
   * Travels inside the outline so downstream stages can ground on the
   * original text without host plumbing; the correction loop consumes
   * these as grounding excerpts automatically.
   */
  sourceQuotes?: string[];
  suggestedImageIds?: string[];
  mediaGenerations?: MediaGenerationRequest[];
  quizConfig?: {
    questionCount: number;
    difficulty: 'easy' | 'medium' | 'hard';
    questionTypes: ('single' | 'multiple' | 'text')[];
  };
  /**
   * @deprecated Use widgetType + widgetOutline instead
   * Legacy interactive config - kept for backward compatibility only
   */
  interactiveConfig?: {
    conceptName: string;
    conceptOverview: string;
    designIdea: string;
    subject?: string;
  };
  pblConfig?: {
    projectTopic: string;
    projectDescription: string;
    targetSkills: string[];
    issueCount?: number;
    scenarioRoleplay?: boolean;
    scenarioBrief?: string;
  };
  widgetType?: WidgetType;
  widgetOutline?: WidgetOutline;
}
