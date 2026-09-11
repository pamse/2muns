export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      articles: {
        Row: {
          id: string;
          title: string;
          content: string;
          category: string;
          icon: string;
          order_num: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          category: string;
          icon: string;
          order_num?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string;
          category?: string;
          icon?: string;
          order_num?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      notices: {
        Row: {
          id: string;
          title: string;
          content: string;
          tag: string | null;
          is_active: boolean;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          tag?: string | null;
          is_active?: boolean;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string;
          tag?: string | null;
          is_active?: boolean;
          user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          title: string;
          category: string;
          description: string | null;
          auth_start_time: string;
          auth_end_time: string;
          is_flexible: boolean | null;
          max_capacity: number | null;
          current_count: number | null;
          status: string | null;
          owner_id: string | null;
          started_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category: string;
          description?: string | null;
          auth_start_time?: string;
          auth_end_time?: string;
          is_flexible?: boolean | null;
          max_capacity?: number | null;
          current_count?: number | null;
          status?: string | null;
          owner_id?: string | null;
          started_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          category?: string;
          description?: string | null;
          auth_start_time?: string;
          auth_end_time?: string;
          is_flexible?: boolean | null;
          max_capacity?: number | null;
          current_count?: number | null;
          status?: string | null;
          owner_id?: string | null;
          started_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          nickname: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          nickname?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          nickname?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      verifications: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          day: number;
          comment: string | null;
          video_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          day: number;
          comment?: string | null;
          video_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          day?: number;
          comment?: string | null;
          video_path?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string | null;
          nickname: string | null;
          avatar_url: string | null;
          selected_categories: string[] | null;
          nickname_updated_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          nickname?: string | null;
          avatar_url?: string | null;
          selected_categories?: string[] | null;
          nickname_updated_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          nickname?: string | null;
          avatar_url?: string | null;
          selected_categories?: string[] | null;
          nickname_updated_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Article = Database["public"]["Tables"]["articles"]["Row"];
export type ArticleInsert = Database["public"]["Tables"]["articles"]["Insert"];
export type ArticleUpdate = Database["public"]["Tables"]["articles"]["Update"];
export type Notice = Database["public"]["Tables"]["notices"]["Row"];
export type AppUser = Database["public"]["Tables"]["users"]["Row"];
export type AppGroup = Database["public"]["Tables"]["groups"]["Row"];
export type AppGroupMember = Database["public"]["Tables"]["group_members"]["Row"];
export type Verification = Database["public"]["Tables"]["verifications"]["Row"];
