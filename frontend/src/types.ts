export type DeckType = "fibonacci" | "powers_of_2" | "sequential" | "tshirt";

export interface Player {
  id: string;
  nickname: string;
  is_facilitator: boolean;
  is_spectator: boolean;
  connected: boolean;
  disconnected_at: string | null;
  avatar_color: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  link: string;
  final_estimate: string | null;
}

export interface GameSettings {
  autoReveal: boolean;
  funFeatures: boolean;
  whoCanReveal: "facilitator" | "everyone";
  whoCanManageIssues: "facilitator" | "everyone";
}

export interface RoomState {
  id: string;
  name: string;
  deck_type: DeckType;
  card_back: string;
  deck: string[];
  facilitator_id: string | null;
  players: Player[];
  issues: Issue[];
  current_issue_id: string | null;
  votes: Record<string, string>; // value либо "hidden"
  voted_player_ids: string[];
  revealed: boolean;
}

export interface Stats {
  average: number | null;
  median: number | null;
  distribution: Record<string, number>;
  consensus: boolean;
  total_votes: number;
}
