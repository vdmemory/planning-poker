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
}

export interface RoomState {
  id: string;
  name: string;
  deck_type: DeckType;
  card_back: string;
  who_can_reveal: "facilitator" | "everyone";
  who_can_manage_issues: "facilitator" | "everyone";
  // Issue #19 — when true, dropping the facilitator (timeout cleanup OR
  // explicit leave) tears the room down for everyone instead of handing
  // the role to the next player. Default false to keep existing rooms on
  // the legacy handoff behaviour.
  close_on_facilitator_leave: boolean;
  // Issue #51 — gates the "throw a reaction at another player" hover/tap
  // panel on PlayerCard. Off by default; facilitator opts the room in via
  // Game Settings.
  fun_features_enabled: boolean;
  deck: string[];
  facilitator_id: string | null;
  players: Player[];
  issues: Issue[];
  current_issue_id: string | null;
  votes: Record<string, string>; // value либо "hidden"
  voted_player_ids: string[];
  revealed: boolean;
  // ISO-8601 timestamp. After this moment the room is auto-closed by the
  // backend's `cleanup_expired_rooms` task and the client receives a
  // `room_expired` WS message (or the connect attempt closes with 4005).
  expires_at: string;
}

export interface Stats {
  average: number | null;
  median: number | null;
  distribution: Record<string, number>;
  consensus: boolean;
  total_votes: number;
}

// ---------- Retro Board (issue #62) ----------

export type RetroTemplate = "mad_sad_glad" | "start_stop_continue" | "four_ls";

export interface RetroColumnDef {
  id: string;
  title: string;
  color: string;
}

export interface RetroParticipant {
  id: string;
  nickname: string;
  is_facilitator: boolean;
  connected: boolean;
  disconnected_at: string | null;
  avatar_color: string;
}

export interface RetroCard {
  id: string;
  column_id: string;
  author_id: string;
  text: string;
  votes: string[];
  created_at: string;
}

export interface RetroBoardState {
  id: string;
  name: string;
  template: RetroTemplate;
  columns: RetroColumnDef[];
  cards: RetroCard[];
  participants: RetroParticipant[];
  facilitator_id: string | null;
  // Display-only: hides card author names from OTHER participants on the
  // frontend. Author ids stay on the wire (needed for edit/delete
  // permission checks) — this is a UX toggle, not a secrecy mechanism, same
  // trust model as the rest of this casual team tool.
  anonymous_mode: boolean;
  max_votes_per_person: number;
  timer_running: boolean;
  timer_ends_at: string | null;
  timer_remaining_seconds: number | null;
  expires_at: string;
}
