export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bot_add_sessions: {
        Row: {
          game: string | null
          step: string
          synopsis: string | null
          updated_at: string
          user_id: number
        }
        Insert: {
          game?: string | null
          step: string
          synopsis?: string | null
          updated_at?: string
          user_id: number
        }
        Update: {
          game?: string | null
          step?: string
          synopsis?: string | null
          updated_at?: string
          user_id?: number
        }
        Relationships: []
      }
      sinopse_rounds: {
        Row: {
          answer: string
          created_at: string
          game: string
          id: string
          photo_file_id: string | null
          synopsis: string
        }
        Insert: {
          answer: string
          created_at?: string
          game?: string
          id?: string
          photo_file_id?: string | null
          synopsis: string
        }
        Update: {
          answer?: string
          created_at?: string
          game?: string
          id?: string
          photo_file_id?: string | null
          synopsis?: string
        }
        Relationships: []
      }
      telegram_character_sessions: {
        Row: {
          chat_id: number
          draft: Json
          step: string
          updated_at: string
          user_id: number
        }
        Insert: {
          chat_id: number
          draft?: Json
          step: string
          updated_at?: string
          user_id: number
        }
        Update: {
          chat_id?: number
          draft?: Json
          step?: string
          updated_at?: string
          user_id?: number
        }
        Relationships: []
      }
      telegram_characters: {
        Row: {
          base_price: number
          created_at: string
          id: string
          name: string
          name_key: string
          owner_id: number | null
          paid_price: number
          photo_file_id: string
          purchases: number
          work: string
        }
        Insert: {
          base_price: number
          created_at?: string
          id?: string
          name: string
          name_key: string
          owner_id?: number | null
          paid_price?: number
          photo_file_id: string
          purchases?: number
          work: string
        }
        Update: {
          base_price?: number
          created_at?: string
          id?: string
          name?: string
          name_key?: string
          owner_id?: number | null
          paid_price?: number
          photo_file_id?: string
          purchases?: number
          work?: string
        }
        Relationships: []
      }
      telegram_content_messages: {
        Row: {
          chat_id: number
          created_at: string
          kind: string
          message_id: number
          target_id: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          kind: string
          message_id: number
          target_id: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          kind?: string
          message_id?: number
          target_id?: string
        }
        Relationships: []
      }
      telegram_content_sessions: {
        Row: {
          chat_id: number
          expires_at: string
          field: string | null
          id: string
          kind: string
          operation: string
          prompt_message_id: number | null
          target_id: string
          user_id: number
        }
        Insert: {
          chat_id: number
          expires_at?: string
          field?: string | null
          id?: string
          kind: string
          operation: string
          prompt_message_id?: number | null
          target_id: string
          user_id: number
        }
        Update: {
          chat_id?: number
          expires_at?: string
          field?: string | null
          id?: string
          kind?: string
          operation?: string
          prompt_message_id?: number | null
          target_id?: string
          user_id?: number
        }
        Relationships: []
      }
      telegram_economy_events: {
        Row: {
          action: string
          created_at: string
          event_key: string
          result: Json
          user_id: number
        }
        Insert: {
          action: string
          created_at?: string
          event_key: string
          result: Json
          user_id: number
        }
        Update: {
          action?: string
          created_at?: string
          event_key?: string
          result?: Json
          user_id?: number
        }
        Relationships: []
      }
      telegram_gens: {
        Row: {
          balance: number
          last_daily_at: string | null
          telegram_user_id: number
          updated_at: string
          username: string | null
        }
        Insert: {
          balance?: number
          last_daily_at?: string | null
          telegram_user_id: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          balance?: number
          last_daily_at?: string | null
          telegram_user_id?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      telegram_pending_confirmations: {
        Row: {
          action: string
          args: Json
          chat_id: number
          created_at: string
          expires_at: string
          id: string
          status: string
          user_id: number
        }
        Insert: {
          action: string
          args?: Json
          chat_id: number
          created_at?: string
          expires_at?: string
          id?: string
          status?: string
          user_id: number
        }
        Update: {
          action?: string
          args?: Json
          chat_id?: number
          created_at?: string
          expires_at?: string
          id?: string
          status?: string
          user_id?: number
        }
        Relationships: []
      }
      telegram_trades: {
        Row: {
          chat_id: number
          created_at: string
          expires_at: string
          id: string
          proposer_character: string | null
          proposer_confirmed: boolean
          proposer_id: number
          recipient_character: string | null
          recipient_confirmed: boolean
          recipient_id: number
          status: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          expires_at?: string
          id?: string
          proposer_character?: string | null
          proposer_confirmed?: boolean
          proposer_id: number
          recipient_character?: string | null
          recipient_confirmed?: boolean
          recipient_id: number
          status?: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          expires_at?: string
          id?: string
          proposer_character?: string | null
          proposer_confirmed?: boolean
          proposer_id?: number
          recipient_character?: string | null
          recipient_confirmed?: boolean
          recipient_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_trades_proposer_character_fkey"
            columns: ["proposer_character"]
            isOneToOne: false
            referencedRelation: "telegram_character_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_trades_proposer_character_fkey"
            columns: ["proposer_character"]
            isOneToOne: false
            referencedRelation: "telegram_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_trades_recipient_character_fkey"
            columns: ["recipient_character"]
            isOneToOne: false
            referencedRelation: "telegram_character_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_trades_recipient_character_fkey"
            columns: ["recipient_character"]
            isOneToOne: false
            referencedRelation: "telegram_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_wishes: {
        Row: {
          character_id: string
          created_at: string
          user_id: number
        }
        Insert: {
          character_id: string
          created_at?: string
          user_id: number
        }
        Update: {
          character_id?: string
          created_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_wishes_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "telegram_character_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_wishes_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "telegram_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      typing_battle_settings: {
        Row: {
          chat_id: number
          enabled: boolean
          frequency_minutes: number
          style: string
          updated_at: string
        }
        Insert: {
          chat_id: number
          enabled?: boolean
          frequency_minutes?: number
          style?: string
          updated_at?: string
        }
        Update: {
          chat_id?: number
          enabled?: boolean
          frequency_minutes?: number
          style?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      telegram_character_catalog: {
        Row: {
          base_price: number | null
          created_at: string | null
          id: string | null
          name: string | null
          name_key: string | null
          owner_id: number | null
          owner_username: string | null
          paid_price: number | null
          photo_file_id: string | null
          position: number | null
          price: number | null
          purchases: number | null
          wish_count: number | null
          work: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_telegram_daily: {
        Args: {
          p_amount?: number
          p_ignore_limit?: boolean
          p_user_id: number
          p_username?: string
        }
        Returns: {
          balance: number
          is_first: boolean
          next_daily_at: string
          ok: boolean
        }[]
      }
      get_telegram_gens: {
        Args: { p_user_id: number; p_username?: string }
        Returns: {
          balance: number
          next_daily_at: string
        }[]
      }
      telegram_character_action: {
        Args: {
          p_action: string
          p_args: Json
          p_event_key: string
          p_user_id: number
          p_username: string
        }
        Returns: Json
      }
      telegram_manage_content: {
        Args: {
          p_action: string
          p_chat_id: number
          p_event_key: string
          p_prompt_id: number
          p_session_id: string
          p_user_id: number
          p_value: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
