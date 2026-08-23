import type { Board } from "./types";

export const seedBoard: Board = {
  columns: [
    { id: "col-1", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-2", title: "To Do", cardIds: ["card-3", "card-4"] },
    { id: "col-3", title: "In Progress", cardIds: ["card-5"] },
    { id: "col-4", title: "Review", cardIds: ["card-6"] },
    { id: "col-5", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Research competitor apps",
      details: "Look at three similar kanban tools and note what to avoid.",
    },
    "card-2": {
      id: "card-2",
      title: "Sketch onboarding flow",
      details: "Rough wireframes for first-time user experience.",
    },
    "card-3": {
      id: "card-3",
      title: "Set up project repo",
      details: "Initialize repository and base project structure.",
    },
    "card-4": {
      id: "card-4",
      title: "Define color palette",
      details: "Finalize the brand colors used across the app.",
    },
    "card-5": {
      id: "card-5",
      title: "Build column component",
      details: "Implement the column with rename support.",
    },
    "card-6": {
      id: "card-6",
      title: "Review card component",
      details: "Check spacing, contrast, and hover states.",
    },
    "card-7": {
      id: "card-7",
      title: "Approve project name",
      details: "Team agreed on the final project name.",
    },
    "card-8": {
      id: "card-8",
      title: "Kickoff meeting",
      details: "Held the initial planning meeting with stakeholders.",
    },
  },
};
