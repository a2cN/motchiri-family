
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "genre": {
                  Row: {
                    "created_at": string,"default_location_id": string | null,"household_id": string,"id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_location_id"?: string | null,"household_id": string,"id"?: string,"name": string,"sort_order": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_location_id"?: string | null,"household_id"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "genre_household_id_default_location_id_fkey"
      columns: ["household_id","default_location_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["household_id","id"]
    },{
      foreignKeyName: "genre_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household"
      referencedColumns: ["id"]
    }
                  ]
                },"household": {
                  Row: {
                    "created_at": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"item": {
                  Row: {
                    "created_at": string,"genre_id": string | null,"household_id": string,"id": string,"is_regular": boolean,"item_kind": string,"last_expiry_days": number | null,"location_id": string | null,"name": string,"restock_at_count": number | null,"restock_at_level": string | null,"stock_level": string | null,"tracking": string,"unit_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"genre_id"?: string | null,"household_id": string,"id"?: string,"is_regular"?: boolean,"item_kind": string,"last_expiry_days"?: number | null,"location_id"?: string | null,"name": string,"restock_at_count"?: number | null,"restock_at_level"?: string | null,"stock_level"?: string | null,"tracking": string,"unit_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"genre_id"?: string | null,"household_id"?: string,"id"?: string,"is_regular"?: boolean,"item_kind"?: string,"last_expiry_days"?: number | null,"location_id"?: string | null,"name"?: string,"restock_at_count"?: number | null,"restock_at_level"?: string | null,"stock_level"?: string | null,"tracking"?: string,"unit_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_household_id_genre_id_fkey"
      columns: ["household_id","genre_id"]
isOneToOne: false
      referencedRelation: "genre"
      referencedColumns: ["household_id","id"]
    },{
      foreignKeyName: "item_household_id_location_id_fkey"
      columns: ["household_id","location_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["household_id","id"]
    },{
      foreignKeyName: "item_household_id_unit_id_fkey"
      columns: ["household_id","unit_id"]
isOneToOne: false
      referencedRelation: "unit"
      referencedColumns: ["household_id","id"]
    }
                  ]
                },"item_stock": {
                  Row: {
                    "created_at": string,"expires_on": string | null,"household_id": string,"id": string,"item_id": string,"location_id": string | null,"purchased_on": string,"quantity": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_on"?: string | null,"household_id": string,"id"?: string,"item_id": string,"location_id"?: string | null,"purchased_on"?: string,"quantity": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"expires_on"?: string | null,"household_id"?: string,"id"?: string,"item_id"?: string,"location_id"?: string | null,"purchased_on"?: string,"quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_stock_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_stock_household_id_item_id_fkey"
      columns: ["household_id","item_id"]
isOneToOne: false
      referencedRelation: "item"
      referencedColumns: ["household_id","id"]
    },{
      foreignKeyName: "item_stock_household_id_location_id_fkey"
      columns: ["household_id","location_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["household_id","id"]
    }
                  ]
                },"location": {
                  Row: {
                    "created_at": string,"household_id": string,"id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"id"?: string,"name": string,"sort_order": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "location_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household"
      referencedColumns: ["id"]
    }
                  ]
                },"member": {
                  Row: {
                    "created_at": string,"household_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household"
      referencedColumns: ["id"]
    }
                  ]
                },"unit": {
                  Row: {
                    "created_at": string,"household_id": string,"id": string,"is_countable": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"id"?: string,"is_countable"?: boolean,"name": string,"sort_order": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"id"?: string,"is_countable"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
