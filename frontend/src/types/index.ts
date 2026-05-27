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
  created_at: string;
  added_at: string | null;
  last_visited_at: string | null;
};
