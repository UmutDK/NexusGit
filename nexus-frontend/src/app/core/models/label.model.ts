export interface Label {
  id: string;
  teamId: string;
  name: string;
  color: string;
}

export interface CreateLabelRequest {
  name: string;
  color?: string;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: string;
}
