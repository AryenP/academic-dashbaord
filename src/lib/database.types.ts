export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      phone_events: {
        Row: {
          app: string;
          at: string;
          id: number;
          kind: string;
          received_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          app: string;
          at?: string;
          id?: never;
          kind: string;
          received_at?: string;
          user_id: string;
        };
        Update: {
          app?: string;
          at?: string;
          id?: never;
          kind?: string;
          received_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      phone_rate: {
        Row: {
          hits: number;
          minute: string;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          hits?: number;
          minute: string;
          token_hash: string;
        };
        Update: {
          hits?: number;
          minute?: string;
          token_hash?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          is_owner: boolean;
          phone_token_hash: string | null;
          public_level: string;
          settings: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          is_owner?: boolean;
          phone_token_hash?: string | null;
          public_level?: string;
          settings?: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_owner?: boolean;
          phone_token_hash?: string | null;
          public_level?: string;
          settings?: NonNullable<Json>;
        };
        Relationships: [];
      };
      session_breaks: {
        Row: {
          ended_at: string | null;
          id: string;
          kind: string;
          paused_before: number;
          session_id: string;
          started_at: string;
        };
        ComputedFields: never;
        Insert: {
          ended_at?: string | null;
          id?: string;
          kind: string;
          paused_before?: number;
          session_id: string;
          started_at?: string;
        };
        Update: {
          ended_at?: string | null;
          id?: string;
          kind?: string;
          paused_before?: number;
          session_id?: string;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_breaks_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          break_seconds: number;
          course: string;
          ended_at: string | null;
          focus_pct: number | null;
          id: string;
          longest_stretch_seconds: number | null;
          mode: string;
          note: string | null;
          paused_at: string | null;
          paused_seconds: number;
          phone_seconds: number | null;
          pickups: number | null;
          plan_block_id: string | null;
          rating: number | null;
          source: string;
          started_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          break_seconds?: number;
          course: string;
          ended_at?: string | null;
          focus_pct?: number | null;
          id?: string;
          longest_stretch_seconds?: number | null;
          mode: string;
          note?: string | null;
          paused_at?: string | null;
          paused_seconds?: number;
          phone_seconds?: number | null;
          pickups?: number | null;
          plan_block_id?: string | null;
          rating?: number | null;
          source?: string;
          started_at?: string;
          user_id?: string;
        };
        Update: {
          break_seconds?: number;
          course?: string;
          ended_at?: string | null;
          focus_pct?: number | null;
          id?: string;
          longest_stretch_seconds?: number | null;
          mode?: string;
          note?: string | null;
          paused_at?: string | null;
          paused_seconds?: number;
          phone_seconds?: number | null;
          pickups?: number | null;
          plan_block_id?: string | null;
          rating?: number | null;
          source?: string;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      end_break: {
        Args: { p_at?: string; p_session: string };
        Returns: {
          break_seconds: number;
          course: string;
          ended_at: string | null;
          focus_pct: number | null;
          id: string;
          longest_stretch_seconds: number | null;
          mode: string;
          note: string | null;
          paused_at: string | null;
          paused_seconds: number;
          phone_seconds: number | null;
          pickups: number | null;
          plan_block_id: string | null;
          rating: number | null;
          source: string;
          started_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      end_session: {
        Args: { p_at?: string; p_session: string };
        Returns: {
          break_seconds: number;
          course: string;
          ended_at: string | null;
          focus_pct: number | null;
          id: string;
          longest_stretch_seconds: number | null;
          mode: string;
          note: string | null;
          paused_at: string | null;
          paused_seconds: number;
          phone_seconds: number | null;
          pickups: number | null;
          plan_block_id: string | null;
          rating: number | null;
          source: string;
          started_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      pause_session: {
        Args: { p_at?: string; p_session: string };
        Returns: {
          break_seconds: number;
          course: string;
          ended_at: string | null;
          focus_pct: number | null;
          id: string;
          longest_stretch_seconds: number | null;
          mode: string;
          note: string | null;
          paused_at: string | null;
          paused_seconds: number;
          phone_seconds: number | null;
          pickups: number | null;
          plan_block_id: string | null;
          rating: number | null;
          source: string;
          started_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      phone_rate_hit: { Args: { p_token_hash: string }; Returns: number };
      public_daily_totals: {
        Args: { days?: number };
        Returns: {
          course: string;
          day: string;
          minutes: number;
        }[];
      };
      public_prep_minutes: {
        Args: { p_exams: Json };
        Returns: {
          before: string;
          course: string;
          minutes: number;
        }[];
      };
      resume_session: {
        Args: { p_at?: string; p_session: string };
        Returns: {
          break_seconds: number;
          course: string;
          ended_at: string | null;
          focus_pct: number | null;
          id: string;
          longest_stretch_seconds: number | null;
          mode: string;
          note: string | null;
          paused_at: string | null;
          paused_seconds: number;
          phone_seconds: number | null;
          pickups: number | null;
          plan_block_id: string | null;
          rating: number | null;
          source: string;
          started_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      start_break: {
        Args: { p_at?: string; p_kind?: string; p_session: string };
        Returns: {
          ended_at: string | null;
          id: string;
          kind: string;
          paused_before: number;
          session_id: string;
          started_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'session_breaks';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
