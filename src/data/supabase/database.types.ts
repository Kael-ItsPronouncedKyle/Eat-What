
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity_events": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"after": Json | null,"before": Json | null,"cook_session_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"household_id": string,"id": string,"partner_turn_id": string | null,"source": string,"summary": string,"undo_of_event_id": string | null,"undone_by_event_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"cook_session_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"household_id": string,"id"?: string,"partner_turn_id"?: string | null,"source"?: string,"summary": string,"undo_of_event_id"?: string | null,"undone_by_event_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"cook_session_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"household_id"?: string,"id"?: string,"partner_turn_id"?: string | null,"source"?: string,"summary"?: string,"undo_of_event_id"?: string | null,"undone_by_event_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_partner_turn_id_household_id_fkey"
      columns: ["partner_turn_id","household_id"]
isOneToOne: false
      referencedRelation: "partner_turns"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "cost_cents": number,"created_at": string,"fn": string,"household_id": string | null,"id": string,"images": number,"input_tokens": number,"output_tokens": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_cents"?: number,"created_at"?: string,"fn": string,"household_id"?: string | null,"id"?: string,"images"?: number,"input_tokens"?: number,"output_tokens"?: number,"user_id"?: string | null
                  }
                  Update: {
                    "cost_cents"?: number,"created_at"?: string,"fn"?: string,"household_id"?: string | null,"id"?: string,"images"?: number,"input_tokens"?: number,"output_tokens"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"batches": {
                  Row: {
                    "container_plan": NonNullable<Json>,"cook_person_id": string | null,"cook_week_id": string | null,"cooked_at": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"estimated_cost_cents": number | null,"household_id": string,"id": string,"kind": string,"multiplier": number,"notes": string | null,"recipe_id": string,"scheduled_on": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "container_plan"?: NonNullable<Json>,"cook_person_id"?: string | null,"cook_week_id"?: string | null,"cooked_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"estimated_cost_cents"?: number | null,"household_id": string,"id"?: string,"kind"?: string,"multiplier"?: number,"notes"?: string | null,"recipe_id": string,"scheduled_on"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "container_plan"?: NonNullable<Json>,"cook_person_id"?: string | null,"cook_week_id"?: string | null,"cooked_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"estimated_cost_cents"?: number | null,"household_id"?: string,"id"?: string,"kind"?: string,"multiplier"?: number,"notes"?: string | null,"recipe_id"?: string,"scheduled_on"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batches_cook_person_id_household_id_fkey"
      columns: ["cook_person_id","household_id"]
isOneToOne: false
      referencedRelation: "persons"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "batches_cook_week_id_household_id_fkey"
      columns: ["cook_week_id","household_id"]
isOneToOne: false
      referencedRelation: "cook_weeks"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "batches_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"containers": {
                  Row: {
                    "capacity_ml": number,"count_owned": number,"created_at": string,"created_by": string | null,"deleted_at": string | null,"disposable": boolean,"household_id": string,"id": string,"kind": string,"microwave_safe": boolean,"name": string,"oven_safe": boolean,"sort_order": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity_ml": number,"count_owned"?: number,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"disposable"?: boolean,"household_id": string,"id"?: string,"kind": string,"microwave_safe"?: boolean,"name": string,"oven_safe"?: boolean,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "capacity_ml"?: number,"count_owned"?: number,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"disposable"?: boolean,"household_id"?: string,"id"?: string,"kind"?: string,"microwave_safe"?: boolean,"name"?: string,"oven_safe"?: boolean,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "containers_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"cook_sessions": {
                  Row: {
                    "batch_id": string | null,"cooked_by": string | null,"created_at": string,"created_by": string | null,"deductions": NonNullable<Json>,"deleted_at": string | null,"finished_at": string | null,"household_id": string,"id": string,"plan_entry_id": string | null,"recipe_id": string,"servings_made": number | null,"started_at": string,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"cooked_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deductions"?: NonNullable<Json>,"deleted_at"?: string | null,"finished_at"?: string | null,"household_id": string,"id"?: string,"plan_entry_id"?: string | null,"recipe_id": string,"servings_made"?: number | null,"started_at"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "batch_id"?: string | null,"cooked_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deductions"?: NonNullable<Json>,"deleted_at"?: string | null,"finished_at"?: string | null,"household_id"?: string,"id"?: string,"plan_entry_id"?: string | null,"recipe_id"?: string,"servings_made"?: number | null,"started_at"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cook_sessions_batch_id_household_id_fkey"
      columns: ["batch_id","household_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "cook_sessions_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cook_sessions_plan_entry_id_household_id_fkey"
      columns: ["plan_entry_id","household_id"]
isOneToOne: false
      referencedRelation: "plan_entries"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "cook_sessions_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"cook_weeks": {
                  Row: {
                    "budget_target_cents": number | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"ends_on": string,"household_id": string,"id": string,"name": string,"starts_on": string,"status": string,"timeline": NonNullable<Json>,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_target_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"ends_on": string,"household_id": string,"id"?: string,"name"?: string,"starts_on": string,"status"?: string,"timeline"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "budget_target_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"ends_on"?: string,"household_id"?: string,"id"?: string,"name"?: string,"starts_on"?: string,"status"?: string,"timeline"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cook_weeks_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"freezer_blocks": {
                  Row: {
                    "batch_id": string | null,"container_id": string | null,"cooked_on": string | null,"count_initial": number,"count_remaining": number,"created_at": string,"created_by": string | null,"deleted_at": string | null,"food_type": string,"freezer_spot": string | null,"household_id": string,"id": string,"label_text": string | null,"location_id": string | null,"notes": string | null,"person_id": string | null,"portion_label": string | null,"portion_ml": number | null,"quality_until": string | null,"recipe_id": string | null,"servings_per_block": number,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"container_id"?: string | null,"cooked_on"?: string | null,"count_initial"?: number,"count_remaining"?: number,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"food_type"?: string,"freezer_spot"?: string | null,"household_id": string,"id"?: string,"label_text"?: string | null,"location_id"?: string | null,"notes"?: string | null,"person_id"?: string | null,"portion_label"?: string | null,"portion_ml"?: number | null,"quality_until"?: string | null,"recipe_id"?: string | null,"servings_per_block"?: number,"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "batch_id"?: string | null,"container_id"?: string | null,"cooked_on"?: string | null,"count_initial"?: number,"count_remaining"?: number,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"food_type"?: string,"freezer_spot"?: string | null,"household_id"?: string,"id"?: string,"label_text"?: string | null,"location_id"?: string | null,"notes"?: string | null,"person_id"?: string | null,"portion_label"?: string | null,"portion_ml"?: number | null,"quality_until"?: string | null,"recipe_id"?: string | null,"servings_per_block"?: number,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "freezer_blocks_batch_id_household_id_fkey"
      columns: ["batch_id","household_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "freezer_blocks_container_id_household_id_fkey"
      columns: ["container_id","household_id"]
isOneToOne: false
      referencedRelation: "containers"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "freezer_blocks_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "freezer_blocks_location_id_household_id_fkey"
      columns: ["location_id","household_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "freezer_blocks_person_id_household_id_fkey"
      columns: ["person_id","household_id"]
isOneToOne: false
      referencedRelation: "persons"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "freezer_blocks_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"households": {
                  Row: {
                    "budget_monthly_cents": number | null,"budget_warn_pct": number,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"id": string,"name": string,"quiet_from": string | null,"quiet_to": string | null,"settings": NonNullable<Json>,"timezone": string,"updated_at": string,"updated_by": string | null,"zip": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_monthly_cents"?: number | null,"budget_warn_pct"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"name": string,"quiet_from"?: string | null,"quiet_to"?: string | null,"settings"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"zip"?: string | null
                  }
                  Update: {
                    "budget_monthly_cents"?: number | null,"budget_warn_pct"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"name"?: string,"quiet_from"?: string | null,"quiet_to"?: string | null,"settings"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"zip"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ingredient_fdc_overrides": {
                  Row: {
                    "canonical_name": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"fdc_id": number,"household_id": string,"id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canonical_name": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fdc_id": number,"household_id": string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "canonical_name"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fdc_id"?: number,"household_id"?: string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredient_fdc_overrides_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"email": string | null,"expires_at": string,"household_id": string | null,"id": string,"kind": string,"max_uses": number,"new_household_name": string | null,"role": string,"token_hash": string,"updated_at": string,"updated_by": string | null,"used_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"email"?: string | null,"expires_at"?: string,"household_id"?: string | null,"id"?: string,"kind": string,"max_uses"?: number,"new_household_name"?: string | null,"role"?: string,"token_hash": string,"updated_at"?: string,"updated_by"?: string | null,"used_count"?: number
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"email"?: string | null,"expires_at"?: string,"household_id"?: string | null,"id"?: string,"kind"?: string,"max_uses"?: number,"new_household_name"?: string | null,"role"?: string,"token_hash"?: string,"updated_at"?: string,"updated_by"?: string | null,"used_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"item_aliases": {
                  Row: {
                    "alias": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"item_id": string,"retailer_id": string | null,"source": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alias": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"item_id": string,"retailer_id"?: string | null,"source"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "alias"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"item_id"?: string,"retailer_id"?: string | null,"source"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_aliases_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_aliases_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"item_retailer_links": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"external_id": string | null,"external_url": string | null,"household_id": string,"id": string,"item_id": string,"last_price_cents": number | null,"retailer_id": string,"search_term": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"external_id"?: string | null,"external_url"?: string | null,"household_id": string,"id"?: string,"item_id": string,"last_price_cents"?: number | null,"retailer_id": string,"search_term"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"external_id"?: string | null,"external_url"?: string | null,"household_id"?: string,"id"?: string,"item_id"?: string,"last_price_cents"?: number | null,"retailer_id"?: string,"search_term"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_retailer_links_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_retailer_links_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "item_retailer_links_retailer_id_household_id_fkey"
      columns: ["retailer_id","household_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"items": {
                  Row: {
                    "always_have": boolean,"auto_list": boolean,"barcode": string | null,"canonical_name": string,"category": string,"created_at": string,"created_by": string | null,"default_shelf_life_days": number | null,"deleted_at": string | null,"household_id": string,"id": string,"image_path": string | null,"location_id": string | null,"name": string,"notes": string | null,"par": number | null,"person_id": string | null,"qty": number | null,"sort_order": number,"status": string,"track_mode": string,"unit": string | null,"updated_at": string,"updated_by": string | null,"use_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "always_have"?: boolean,"auto_list"?: boolean,"barcode"?: string | null,"canonical_name": string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"default_shelf_life_days"?: number | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"image_path"?: string | null,"location_id"?: string | null,"name": string,"notes"?: string | null,"par"?: number | null,"person_id"?: string | null,"qty"?: number | null,"sort_order"?: number,"status"?: string,"track_mode"?: string,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"use_by"?: string | null
                  }
                  Update: {
                    "always_have"?: boolean,"auto_list"?: boolean,"barcode"?: string | null,"canonical_name"?: string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"default_shelf_life_days"?: number | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"image_path"?: string | null,"location_id"?: string | null,"name"?: string,"notes"?: string | null,"par"?: number | null,"person_id"?: string | null,"qty"?: number | null,"sort_order"?: number,"status"?: string,"track_mode"?: string,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"use_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_location_id_household_id_fkey"
      columns: ["location_id","household_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "items_person_id_household_id_fkey"
      columns: ["person_id","household_id"]
isOneToOne: false
      referencedRelation: "persons"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"list_lines": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"item_id": string | null,"list_send_id": string | null,"name": string,"note": string | null,"position": number,"price_cents_est": number | null,"qty": number | null,"reasons": NonNullable<Json>,"retailer_id": string | null,"search_term": string | null,"status": string,"unit": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"item_id"?: string | null,"list_send_id"?: string | null,"name": string,"note"?: string | null,"position"?: number,"price_cents_est"?: number | null,"qty"?: number | null,"reasons"?: NonNullable<Json>,"retailer_id"?: string | null,"search_term"?: string | null,"status"?: string,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"item_id"?: string | null,"list_send_id"?: string | null,"name"?: string,"note"?: string | null,"position"?: number,"price_cents_est"?: number | null,"qty"?: number | null,"reasons"?: NonNullable<Json>,"retailer_id"?: string | null,"search_term"?: string | null,"status"?: string,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "list_lines_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "list_lines_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "list_lines_list_send_id_household_id_fkey"
      columns: ["list_send_id","household_id"]
isOneToOne: false
      referencedRelation: "list_sends"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "list_lines_retailer_id_household_id_fkey"
      columns: ["retailer_id","household_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"list_sends": {
                  Row: {
                    "actual_total_cents": number | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"estimated_total_cents": number | null,"external_order_ref": string | null,"external_url": string | null,"household_id": string,"id": string,"line_count": number,"received_at": string | null,"retailer_id": string | null,"sent_at": string,"sent_by": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_total_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"estimated_total_cents"?: number | null,"external_order_ref"?: string | null,"external_url"?: string | null,"household_id": string,"id"?: string,"line_count"?: number,"received_at"?: string | null,"retailer_id"?: string | null,"sent_at"?: string,"sent_by"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "actual_total_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"estimated_total_cents"?: number | null,"external_order_ref"?: string | null,"external_url"?: string | null,"household_id"?: string,"id"?: string,"line_count"?: number,"received_at"?: string | null,"retailer_id"?: string | null,"sent_at"?: string,"sent_by"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "list_sends_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "list_sends_retailer_id_household_id_fkey"
      columns: ["retailer_id","household_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"is_freezer_shelf": boolean,"kind": string,"name": string,"parent_id": string | null,"sort_order": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"is_freezer_shelf"?: boolean,"kind": string,"name": string,"parent_id"?: string | null,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"is_freezer_shelf"?: boolean,"kind"?: string,"name"?: string,"parent_id"?: string | null,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "locations_parent_id_household_id_fkey"
      columns: ["parent_id","household_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"energy_level": string | null,"energy_set_on": string | null,"household_id": string,"id": string,"invited_by": string | null,"person_id": string | null,"role": string,"updated_at": string,"updated_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"energy_level"?: string | null,"energy_set_on"?: string | null,"household_id": string,"id"?: string,"invited_by"?: string | null,"person_id"?: string | null,"role": string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"energy_level"?: string | null,"energy_set_on"?: string | null,"household_id"?: string,"id"?: string,"invited_by"?: string | null,"person_id"?: string | null,"role"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_person_id_household_id_fkey"
      columns: ["person_id","household_id"]
isOneToOne: false
      referencedRelation: "persons"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"notification_prefs": {
                  Row: {
                    "created_at": string,"enabled": boolean,"household_id": string,"id": string,"type": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"household_id": string,"id"?: string,"type": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"household_id"?: string,"id"?: string,"type"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_prefs_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_turns": {
                  Row: {
                    "applied": NonNullable<Json>,"created_at": string,"created_by": string | null,"deleted_at": string | null,"error": string | null,"household_id": string,"id": string,"intents": NonNullable<Json>,"status": string,"transcript_confidence": number | null,"updated_at": string,"updated_by": string | null,"user_id": string | null,"utterance": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"error"?: string | null,"household_id": string,"id"?: string,"intents"?: NonNullable<Json>,"status"?: string,"transcript_confidence"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null,"utterance": string
                  }
                  Update: {
                    "applied"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"error"?: string | null,"household_id"?: string,"id"?: string,"intents"?: NonNullable<Json>,"status"?: string,"transcript_confidence"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null,"utterance"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_turns_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"persons": {
                  Row: {
                    "color": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"name": string,"plate_profile": NonNullable<Json>,"sort_order": number,"updated_at": string,"updated_by": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"name": string,"plate_profile"?: NonNullable<Json>,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"name"?: string,"plate_profile"?: NonNullable<Json>,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "persons_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_entries": {
                  Row: {
                    "batch_id": string | null,"created_at": string,"created_by": string | null,"date": string,"deleted_at": string | null,"freezer_block_id": string | null,"household_id": string,"id": string,"kind": string,"note": string | null,"person_id": string | null,"position": number,"recipe_id": string | null,"servings": number | null,"slot": string,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"date": string,"deleted_at"?: string | null,"freezer_block_id"?: string | null,"household_id": string,"id"?: string,"kind": string,"note"?: string | null,"person_id"?: string | null,"position"?: number,"recipe_id"?: string | null,"servings"?: number | null,"slot"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "batch_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"freezer_block_id"?: string | null,"household_id"?: string,"id"?: string,"kind"?: string,"note"?: string | null,"person_id"?: string | null,"position"?: number,"recipe_id"?: string | null,"servings"?: number | null,"slot"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_entries_batch_id_household_id_fkey"
      columns: ["batch_id","household_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "plan_entries_freezer_block_id_household_id_fkey"
      columns: ["freezer_block_id","household_id"]
isOneToOne: false
      referencedRelation: "freezer_blocks"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "plan_entries_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_entries_person_id_household_id_fkey"
      columns: ["person_id","household_id"]
isOneToOne: false
      referencedRelation: "persons"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "plan_entries_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"prices": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"item_id": string,"note": string | null,"observed_on": string,"price_cents": number,"receipt_id": string | null,"retailer_id": string | null,"source": string,"unit": string | null,"unit_qty": number | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"item_id": string,"note"?: string | null,"observed_on"?: string,"price_cents": number,"receipt_id"?: string | null,"retailer_id"?: string | null,"source"?: string,"unit"?: string | null,"unit_qty"?: number | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"item_id"?: string,"note"?: string | null,"observed_on"?: string,"price_cents"?: number,"receipt_id"?: string | null,"retailer_id"?: string | null,"source"?: string,"unit"?: string | null,"unit_qty"?: number | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prices_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prices_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "prices_receipt_id_household_id_fkey"
      columns: ["receipt_id","household_id"]
isOneToOne: false
      referencedRelation: "receipts"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "prices_retailer_id_household_id_fkey"
      columns: ["retailer_id","household_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"product_cache": {
                  Row: {
                    "barcode": string,"brand": string | null,"category": string | null,"fetched_at": string,"image_url": string | null,"name": string | null,"raw": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode": string,"brand"?: string | null,"category"?: string | null,"fetched_at"?: string,"image_url"?: string | null,"name"?: string | null,"raw"?: Json | null
                  }
                  Update: {
                    "barcode"?: string,"brand"?: string | null,"category"?: string | null,"fetched_at"?: string,"image_url"?: string | null,"name"?: string | null,"raw"?: Json | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"email": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"email"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"email"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"last_seen_at": string,"p256dh": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"last_seen_at"?: string,"p256dh": string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"last_seen_at"?: string,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"receipt_lines": {
                  Row: {
                    "created_at": string,"household_id": string,"id": string,"item_id": string | null,"line_total_cents": number | null,"qty": number | null,"raw_text": string,"receipt_id": string,"status": string,"unit_price_cents": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"id"?: string,"item_id"?: string | null,"line_total_cents"?: number | null,"qty"?: number | null,"raw_text": string,"receipt_id": string,"status"?: string,"unit_price_cents"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"id"?: string,"item_id"?: string | null,"line_total_cents"?: number | null,"qty"?: number | null,"raw_text"?: string,"receipt_id"?: string,"status"?: string,"unit_price_cents"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipt_lines_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipt_lines_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "receipt_lines_receipt_id_household_id_fkey"
      columns: ["receipt_id","household_id"]
isOneToOne: false
      referencedRelation: "receipts"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"receipts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"list_send_id": string | null,"purchased_on": string | null,"raw_result": Json | null,"retailer_id": string | null,"status": string,"storage_path": string | null,"total_cents": number | null,"updated_at": string,"updated_by": string | null,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"list_send_id"?: string | null,"purchased_on"?: string | null,"raw_result"?: Json | null,"retailer_id"?: string | null,"status"?: string,"storage_path"?: string | null,"total_cents"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"list_send_id"?: string | null,"purchased_on"?: string | null,"raw_result"?: Json | null,"retailer_id"?: string | null,"status"?: string,"storage_path"?: string | null,"total_cents"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipts_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipts_list_send_id_household_id_fkey"
      columns: ["list_send_id","household_id"]
isOneToOne: false
      referencedRelation: "list_sends"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "receipts_retailer_id_household_id_fkey"
      columns: ["retailer_id","household_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "amount": number | null,"canonical_name": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"fdc_id": number | null,"grams": number | null,"group_label": string | null,"household_id": string,"id": string,"ingredient_name": string,"item_id": string | null,"match_confidence": number | null,"optional": boolean,"position": number,"preparation": string | null,"recipe_id": string,"substitute": string | null,"unit": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"canonical_name": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fdc_id"?: number | null,"grams"?: number | null,"group_label"?: string | null,"household_id": string,"id"?: string,"ingredient_name": string,"item_id"?: string | null,"match_confidence"?: number | null,"optional"?: boolean,"position"?: number,"preparation"?: string | null,"recipe_id": string,"substitute"?: string | null,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount"?: number | null,"canonical_name"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fdc_id"?: number | null,"grams"?: number | null,"group_label"?: string | null,"household_id"?: string,"id"?: string,"ingredient_name"?: string,"item_id"?: string | null,"match_confidence"?: number | null,"optional"?: boolean,"position"?: number,"preparation"?: string | null,"recipe_id"?: string,"substitute"?: string | null,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_ingredients_item_id_household_id_fkey"
      columns: ["item_id","household_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "recipe_ingredients_recipe_id_household_id_fkey"
      columns: ["recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"recipe_library": {
                  Row: {
                    "active_minutes": number | null,"base_yield": number,"container_kinds": NonNullable<Json>,"created_at": string,"cuisine": string | null,"description": string | null,"dishes_count": number | null,"equipment": NonNullable<Json>,"est_cost_band": string | null,"freeze_notes": string | null,"id": string,"meal_type": string | null,"reheat_notes": NonNullable<Json>,"source": string,"source_url": string | null,"standing_minutes": number | null,"steps": NonNullable<Json>,"tags": NonNullable<Json>,"title": string,"total_minutes": number | null,"updated_at": string,"yield_unit": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_minutes"?: number | null,"base_yield"?: number,"container_kinds"?: NonNullable<Json>,"created_at"?: string,"cuisine"?: string | null,"description"?: string | null,"dishes_count"?: number | null,"equipment"?: NonNullable<Json>,"est_cost_band"?: string | null,"freeze_notes"?: string | null,"id"?: string,"meal_type"?: string | null,"reheat_notes"?: NonNullable<Json>,"source"?: string,"source_url"?: string | null,"standing_minutes"?: number | null,"steps"?: NonNullable<Json>,"tags"?: NonNullable<Json>,"title": string,"total_minutes"?: number | null,"updated_at"?: string,"yield_unit"?: string
                  }
                  Update: {
                    "active_minutes"?: number | null,"base_yield"?: number,"container_kinds"?: NonNullable<Json>,"created_at"?: string,"cuisine"?: string | null,"description"?: string | null,"dishes_count"?: number | null,"equipment"?: NonNullable<Json>,"est_cost_band"?: string | null,"freeze_notes"?: string | null,"id"?: string,"meal_type"?: string | null,"reheat_notes"?: NonNullable<Json>,"source"?: string,"source_url"?: string | null,"standing_minutes"?: number | null,"steps"?: NonNullable<Json>,"tags"?: NonNullable<Json>,"title"?: string,"total_minutes"?: number | null,"updated_at"?: string,"yield_unit"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_library_ingredients": {
                  Row: {
                    "amount": number | null,"canonical_name": string,"group_label": string | null,"id": string,"ingredient_name": string,"optional": boolean,"position": number,"preparation": string | null,"recipe_id": string,"substitute": string | null,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"canonical_name": string,"group_label"?: string | null,"id"?: string,"ingredient_name": string,"optional"?: boolean,"position"?: number,"preparation"?: string | null,"recipe_id": string,"substitute"?: string | null,"unit"?: string | null
                  }
                  Update: {
                    "amount"?: number | null,"canonical_name"?: string,"group_label"?: string | null,"id"?: string,"ingredient_name"?: string,"optional"?: boolean,"position"?: number,"preparation"?: string | null,"recipe_id"?: string,"substitute"?: string | null,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_library_ingredients_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipe_library"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_transfers": {
                  Row: {
                    "accepted_by": string | null,"created_at": string,"created_by": string | null,"from_household_id": string,"id": string,"recipe_id": string | null,"snapshot": NonNullable<Json>,"status": string,"to_household_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_household_id": string,"id"?: string,"recipe_id"?: string | null,"snapshot": NonNullable<Json>,"status"?: string,"to_household_id": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_household_id"?: string,"id"?: string,"recipe_id"?: string | null,"snapshot"?: NonNullable<Json>,"status"?: string,"to_household_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_transfers_from_household_id_fkey"
      columns: ["from_household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_transfers_to_household_id_fkey"
      columns: ["to_household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "active_minutes": number | null,"base_yield": number,"cost_per_serving_cents": number | null,"created_at": string,"created_by": string | null,"cuisine": string | null,"deleted_at": string | null,"description": string | null,"dishes_count": number | null,"effort_score": number | null,"equipment": NonNullable<Json>,"freeze_notes": string | null,"household_id": string,"id": string,"image_path": string | null,"last_cooked_at": string | null,"library_id": string | null,"meal_type": string | null,"nutrition": Json | null,"plate_notes": NonNullable<Json>,"reheat_notes": NonNullable<Json>,"source": string,"source_url": string | null,"standing_minutes": number | null,"status": string,"steps": NonNullable<Json>,"tags": NonNullable<Json>,"times_cooked": number,"title": string,"total_minutes": number | null,"updated_at": string,"updated_by": string | null,"variant_label": string | null,"variant_of_recipe_id": string | null,"yield_unit": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_minutes"?: number | null,"base_yield"?: number,"cost_per_serving_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"cuisine"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"dishes_count"?: number | null,"effort_score"?: number | null,"equipment"?: NonNullable<Json>,"freeze_notes"?: string | null,"household_id": string,"id"?: string,"image_path"?: string | null,"last_cooked_at"?: string | null,"library_id"?: string | null,"meal_type"?: string | null,"nutrition"?: Json | null,"plate_notes"?: NonNullable<Json>,"reheat_notes"?: NonNullable<Json>,"source"?: string,"source_url"?: string | null,"standing_minutes"?: number | null,"status"?: string,"steps"?: NonNullable<Json>,"tags"?: NonNullable<Json>,"times_cooked"?: number,"title": string,"total_minutes"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"variant_label"?: string | null,"variant_of_recipe_id"?: string | null,"yield_unit"?: string
                  }
                  Update: {
                    "active_minutes"?: number | null,"base_yield"?: number,"cost_per_serving_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"cuisine"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"dishes_count"?: number | null,"effort_score"?: number | null,"equipment"?: NonNullable<Json>,"freeze_notes"?: string | null,"household_id"?: string,"id"?: string,"image_path"?: string | null,"last_cooked_at"?: string | null,"library_id"?: string | null,"meal_type"?: string | null,"nutrition"?: Json | null,"plate_notes"?: NonNullable<Json>,"reheat_notes"?: NonNullable<Json>,"source"?: string,"source_url"?: string | null,"standing_minutes"?: number | null,"status"?: string,"steps"?: NonNullable<Json>,"tags"?: NonNullable<Json>,"times_cooked"?: number,"title"?: string,"total_minutes"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"variant_label"?: string | null,"variant_of_recipe_id"?: string | null,"yield_unit"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_variant_of_recipe_id_household_id_fkey"
      columns: ["variant_of_recipe_id","household_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"retailers": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"is_primary_grocery": boolean,"is_primary_other": boolean,"kind": string,"name": string,"sort_order": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"is_primary_grocery"?: boolean,"is_primary_other"?: boolean,"kind": string,"name": string,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"is_primary_grocery"?: boolean,"is_primary_other"?: boolean,"kind"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "retailers_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"routing_rules": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"match_kind": string,"match_value": string,"priority": number,"retailer_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"match_kind": string,"match_value": string,"priority"?: number,"retailer_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"match_kind"?: string,"match_value"?: string,"priority"?: number,"retailer_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "routing_rules_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routing_rules_retailer_id_household_id_fkey"
      columns: ["retailer_id","household_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"rules": {
                  Row: {
                    "active": boolean,"applies_to_person_id": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"payload": NonNullable<Json>,"type": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"applies_to_person_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"payload"?: NonNullable<Json>,"type": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"applies_to_person_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"payload"?: NonNullable<Json>,"type"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rules_applies_to_person_id_household_id_fkey"
      columns: ["applies_to_person_id","household_id"]
isOneToOne: false
      referencedRelation: "persons"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "rules_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"spend": {
                  Row: {
                    "amount_cents": number,"category": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"id": string,"kind": string,"list_send_id": string | null,"note": string | null,"occurred_on": string,"receipt_id": string | null,"retailer_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"category"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"id"?: string,"kind": string,"list_send_id"?: string | null,"note"?: string | null,"occurred_on"?: string,"receipt_id"?: string | null,"retailer_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"category"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"id"?: string,"kind"?: string,"list_send_id"?: string | null,"note"?: string | null,"occurred_on"?: string,"receipt_id"?: string | null,"retailer_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "spend_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "spend_list_send_id_household_id_fkey"
      columns: ["list_send_id","household_id"]
isOneToOne: false
      referencedRelation: "list_sends"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "spend_receipt_id_household_id_fkey"
      columns: ["receipt_id","household_id"]
isOneToOne: false
      referencedRelation: "receipts"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "spend_retailer_id_household_id_fkey"
      columns: ["retailer_id","household_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"usda_foods": {
                  Row: {
                    "description": string,"fdc_id": number,"fetched_at": string,"nutrients_per_100g": NonNullable<Json>,"portions": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"fdc_id": number,"fetched_at"?: string,"nutrients_per_100g"?: NonNullable<Json>,"portions"?: NonNullable<Json>
                  }
                  Update: {
                    "description"?: string,"fdc_id"?: number,"fetched_at"?: string,"nutrients_per_100g"?: NonNullable<Json>,"portions"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"user_prefs": {
                  Row: {
                    "active_household_id": string | null,"contrast": string,"font": string,"hand": string,"motion": string,"read_aloud": boolean,"text_size": string,"theme": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_household_id"?: string | null,"contrast"?: string,"font"?: string,"hand"?: string,"motion"?: string,"read_aloud"?: boolean,"text_size"?: string,"theme"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active_household_id"?: string | null,"contrast"?: string,"font"?: string,"hand"?: string,"motion"?: string,"read_aloud"?: boolean,"text_size"?: string,"theme"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"check_allergies":
{ Args: { "p_household_id": string,"p_ingredients": (string)[] }; Returns: {
              "ingredient": string,"person_id": string,"rule_id": string,"severity": string,"substitute": string
            }[]
                           },
"copy_library_recipe":
{ Args: { "p_household_id": string,"p_library_id": string }; Returns: string
                           },
"create_household":
{ Args: { "p_kit"?: string,"p_name": string,"p_timezone"?: string,"p_zip"?: string }; Returns: string
                           },
"create_invite":
{ Args: { "p_email"?: string,"p_household_id": string,"p_kind": string,"p_new_household_name"?: string,"p_role"?: string }; Returns: string
                           },
"delete_household":
{ Args: { "p_household_id": string }; Returns: undefined
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
