export interface KhanSubject {
  slug: string;
  title: string;
  description: string;
  icon?: string;
  childCount?: number;
}

export interface KhanTopic {
  slug: string;
  title: string;
  description: string;
  kind: "Topic" | "Course" | "Unit" | "Lesson";
  url: string;
  childCount?: number;
  children?: KhanTopic[];
  contentItems?: KhanContentSummary[];
}

export interface KhanContentSummary {
  slug: string;
  title: string;
  kind: ContentKind;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  description?: string;
}

export type ContentKind = "Video" | "Article" | "Exercise" | "Interactive" | "Challenge" | "Talkthrough" | "Project" | "Unknown";

export interface KhanContent {
  id: string;
  slug: string;
  title: string;
  kind: ContentKind;
  url: string;
  description: string;
  thumbnailUrl?: string;
  // Video-specific
  youtubeId?: string;
  duration?: number;
  // Article-specific
  articleContent?: string;
  // Exercise-specific
  exerciseLength?: number;
  // Common
  authorNames?: string[];
  dateAdded?: string;
  kaUrl: string;
  keyMoments?: KhanKeyMoment[];
}

export interface KhanCourse {
  slug: string;
  title: string;
  description: string;
  url: string;
  units: KhanUnit[];
}

export interface KhanUnit {
  slug: string;
  title: string;
  description?: string;
  lessons: KhanLesson[];
}

export interface KhanLesson {
  slug: string;
  title: string;
  contentItems: KhanContentSummary[];
}

export interface KhanTranscriptEntry {
  start: number;
  duration: number;
  text: string;
}

export interface KhanTranscript {
  videoTitle: string;
  youtubeId: string;
  language: string;
  entries: KhanTranscriptEntry[];
  fullText: string;
}

export interface KhanSearchResult {
  title: string;
  description: string;
  kind: ContentKind;
  url: string;
  slug: string;
  thumbnailUrl?: string;
  parentPath?: string;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export interface KhanArticle {
  slug: string;
  title: string;
  description: string;
  url: string;
  content: string;
  authorNames?: string[];
  dateAdded?: string;
}

export interface KhanLessonDetail {
  slug: string;
  title: string;
  description: string;
  url: string;
  unitTitle?: string;
  courseTitle?: string;
  contentItems: KhanContentSummary[];
  videos: number;
  articles: number;
  exercises: number;
}

export interface KhanKeyMoment {
  label: string;
  startOffset: number;
  endOffset: number;
}

export interface KhanExercise {
  slug: string;
  title: string;
  description: string;
  url: string;
  exerciseLength?: number;
  timeEstimate?: { lowerBound: number; upperBound: number };
  problemTypeKind?: string;
  relatedContent: KhanContentSummary[];
  lessonTitle?: string;
  unitTitle?: string;
  courseTitle?: string;
}

export interface KhanQuiz {
  slug: string;
  title: string;
  description: string;
  url: string;
  kind: "Quiz" | "UnitTest" | "CourseChallenge";
  exerciseLength: number;
  timeEstimate?: { lowerBound: number; upperBound: number };
  unitTitle?: string;
  courseTitle?: string;
  coveredLessons: Array<{ title: string; slug: string; url: string }>;
  relatedExercises: KhanContentSummary[];
}
