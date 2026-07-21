#include <pebble.h>
#include "sha1.h"
#include "base32.h"

#define MAX_ACCOUNTS 100
#define MAX_NAME_LEN 32
#define MAX_SECRET_LEN 80 

#define PERSIST_KEY_NUM_ACCOUNTS 100
#define PERSIST_KEY_ACCOUNT_BASE 200

#if defined(PBL_PLATFORM_EMERY)
  #define ROW_HEIGHT 72
  #define FONT_CODE FONT_KEY_BITHAM_30_BLACK
  #define FONT_NAME FONT_KEY_GOTHIC_24_BOLD
#elif defined(PBL_COLOR)
  #define ROW_HEIGHT 60
  #define FONT_CODE FONT_KEY_BITHAM_30_BLACK
  #define FONT_NAME FONT_KEY_GOTHIC_18_BOLD
#else
  #define ROW_HEIGHT 60
  #define FONT_CODE FONT_KEY_BITHAM_30_BLACK
  #define FONT_NAME FONT_KEY_GOTHIC_18_BOLD
#endif

typedef struct {
  char name[MAX_NAME_LEN];
  char secret[MAX_SECRET_LEN];
  uint8_t period; // TOTP validity window in seconds (e.g. 30 or 60)
} Account;

static Window *s_main_window;
static MenuLayer *s_menu_layer;

static Account s_accounts[MAX_ACCOUNTS];
static int s_num_accounts = 0;

static void generate_totp_string(const char *secret, uint8_t period, char *out_buffer, size_t out_len) {
  uint8_t key[128]; 
  int key_len = base32_decode((const uint8_t *)secret, key, sizeof(key));

  if (key_len <= 0) {
    // Falls das Secret ungültig ist, zeigen wir einen Fehler an
    snprintf(out_buffer, out_len, "ERR 001");
    return;
  }

  if (period == 0) period = 30;
  uint64_t t = time(NULL) / period;

  uint8_t time_bytes[8];
  for (int i = 7; i >= 0; i--) {
    time_bytes[i] = t & 0xFF;
    t >>= 8;
  }

  sha1nfo s; 
  
  sha1_initHmac(&s, key, key_len);
  
  sha1_write(&s, (const char *)time_bytes, 8);
  
  uint8_t *hash = sha1_resultHmac(&s);

  int offset = hash[19] & 0x0f;
  uint32_t truncated_hash = ((hash[offset] & 0x7f) << 24) |
                            ((hash[offset + 1] & 0xff) << 16) |
                            ((hash[offset + 2] & 0xff) << 8) |
                            (hash[offset + 3] & 0xff);

  uint32_t pin_value = truncated_hash % 1000000;

  snprintf(out_buffer, out_len, "%03lu %03lu", 
          (unsigned long)(pin_value / 1000), 
          (unsigned long)(pin_value % 1000));
}

static uint16_t menu_get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *data) {
  return s_num_accounts > 0 ? s_num_accounts : 1;
}

static int16_t menu_get_cell_height_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *data) {
  if (s_num_accounts == 0) {
    return ROW_HEIGHT * 2; 
  }
  return ROW_HEIGHT;
}

static void menu_draw_row_callback(GContext* ctx, const Layer *cell_layer, MenuIndex *cell_index, void *data) {
  GRect bounds = layer_get_bounds(cell_layer);
  
  if (s_num_accounts == 0) {
    graphics_context_set_fill_color(ctx, GColorWhite); 
    graphics_fill_rect(ctx, bounds, 0, GCornerNone);

    // 2. Text gut sichtbar in Schwarz zeichnen
    graphics_context_set_text_color(ctx, GColorBlack);
    graphics_draw_text(ctx, "No Accounts!\nPlease add Accounts in the App-Settings.", 
                       fonts_get_system_font(FONT_NAME), 
                       GRect(5, 5, bounds.size.w - 10, bounds.size.h - 10), 
                       GTextOverflowModeWordWrap, 
                       GTextAlignmentCenter, 
                       NULL);
    return;
  }

  Account *account = &s_accounts[cell_index->row];
  uint8_t period = account->period ? account->period : 30;
  char code_buffer[8];
  generate_totp_string(account->secret, period, code_buffer, sizeof(code_buffer));

  bool is_selected = menu_cell_layer_is_highlighted(cell_layer);
  
  GRect name_rect = GRect(5, 0, bounds.size.w - 10, 24);
  graphics_context_set_text_color(ctx, is_selected ? GColorWhite : GColorBlack);
  graphics_draw_text(ctx, account->name, fonts_get_system_font(FONT_NAME), name_rect, GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

  GRect code_rect = GRect(5, 28, bounds.size.w - 10, bounds.size.h - 28);
  graphics_draw_text(ctx, code_buffer, fonts_get_system_font(FONT_CODE), code_rect, GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);

  time_t now = time(NULL);
  int seconds_remaining = period - (now % period);
  
  int bar_width = (bounds.size.w * seconds_remaining) / period;
  GRect bar_rect = GRect(0, bounds.size.h - 4, bar_width, 4);
  
  #if defined(PBL_COLOR)
    graphics_context_set_fill_color(ctx, seconds_remaining <= 5 ? GColorRed : GColorMalachite);
  #else
    graphics_context_set_fill_color(ctx, is_selected ? GColorWhite : GColorBlack);
  #endif
  
  graphics_fill_rect(ctx, bar_rect, 0, GCornerNone);
}

static void inbox_received_callback(DictionaryIterator *iterator, void *context) {
  Tuple *clear_tuple = dict_find(iterator, MESSAGE_KEY_CLEAR_ACCOUNTS);
  if(clear_tuple) {
    s_num_accounts = 0;
    persist_write_int(PERSIST_KEY_NUM_ACCOUNTS, 0);
    menu_layer_reload_data(s_menu_layer);
    return;
  }

  Tuple *name_tuple = dict_find(iterator, MESSAGE_KEY_ACCOUNT_NAME);
  Tuple *secret_tuple = dict_find(iterator, MESSAGE_KEY_ACCOUNT_SECRET);
  Tuple *period_tuple = dict_find(iterator, MESSAGE_KEY_ACCOUNT_PERIOD);

  if (name_tuple && secret_tuple && s_num_accounts < MAX_ACCOUNTS) {
    strncpy(s_accounts[s_num_accounts].name, name_tuple->value->cstring, MAX_NAME_LEN - 1);
    strncpy(s_accounts[s_num_accounts].secret, secret_tuple->value->cstring, MAX_SECRET_LEN - 1);
    s_accounts[s_num_accounts].period = period_tuple ? (uint8_t)period_tuple->value->int32 : 30;
    
    persist_write_data(PERSIST_KEY_ACCOUNT_BASE + s_num_accounts, &s_accounts[s_num_accounts], sizeof(Account));
    
    s_num_accounts++;
    persist_write_int(PERSIST_KEY_NUM_ACCOUNTS, s_num_accounts);
    
    menu_layer_reload_data(s_menu_layer);
  }
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  if(s_menu_layer) {
    layer_mark_dirty(menu_layer_get_layer(s_menu_layer));
  }
}

static void main_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_menu_layer = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_rows = menu_get_num_rows_callback,
    .get_cell_height = menu_get_cell_height_callback,
    .draw_row = menu_draw_row_callback,
  });
  
  menu_layer_set_click_config_onto_window(s_menu_layer, window);
  layer_add_child(window_layer, menu_layer_get_layer(s_menu_layer));
}

static void main_window_unload(Window *window) {
  menu_layer_destroy(s_menu_layer);
}

static void init() {
  if (persist_exists(PERSIST_KEY_NUM_ACCOUNTS)) {
    s_num_accounts = persist_read_int(PERSIST_KEY_NUM_ACCOUNTS);
    
    if (s_num_accounts > MAX_ACCOUNTS || s_num_accounts < 0) {
      s_num_accounts = 0;
    }
    
    for (int i = 0; i < s_num_accounts; i++) {
      if (persist_exists(PERSIST_KEY_ACCOUNT_BASE + i)) {
        persist_read_data(PERSIST_KEY_ACCOUNT_BASE + i, &s_accounts[i], sizeof(Account));
      }
    }
  }

  s_main_window = window_create();
  
  window_set_background_color(s_main_window, GColorWhite);
  
  window_set_window_handlers(s_main_window, (WindowHandlers) {
    .load = main_window_load,
    .unload = main_window_unload,
  });
  window_stack_push(s_main_window, true);

  app_message_register_inbox_received(inbox_received_callback);
  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());

  tick_timer_service_subscribe(SECOND_UNIT, tick_handler);
}

static void deinit() {
  tick_timer_service_unsubscribe();
  window_destroy(s_main_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
