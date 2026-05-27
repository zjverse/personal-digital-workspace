export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  collapsed: number;
  website_count: number;
};

export type Website = {
  id: string;
  title: string;
  url: string;
  domain: string;
  description: string;
  favicon: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  favorite: number;
  tags: string;
  created_at: string;
  added_at: string | null;
  last_visited_at: string | null;
};

export type ImportHistory = {
  id: string;
  filename: string;
  mode: string;
  total_count: number;
  added_count: number;
  existing_count: number;
  updated_count: number;
  duplicate_count: number;
  deleted_count: number;
  snapshot_id: string;
  created_at: string;
};
