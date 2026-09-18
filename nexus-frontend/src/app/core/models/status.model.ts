export interface Status {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
  isTerminal: boolean;
}

export interface CreateStatusRequest {
  name: string;
  color?: string;
  position?: number;
  isTerminal?: boolean;
}

export interface UpdateStatusRequest {
  name?: string;
  color?: string;
  position?: number;
  isTerminal?: boolean;
}
