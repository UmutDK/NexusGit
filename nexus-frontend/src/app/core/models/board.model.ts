export interface Board {
  id: string;
  teamId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBoardRequest {
  name: string;
}

export interface UpdateBoardRequest {
  name?: string;
}
