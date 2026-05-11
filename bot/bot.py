"""
School Telegram Bot
Clean, professional responses for parents.
"""
import os
import io
import logging
import warnings
import httpx
from datetime import datetime
from dotenv import load_dotenv

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, InputFile
from telegram.warnings import PTBUserWarning
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ConversationHandler,
    filters,
    ContextTypes,
)

warnings.filterwarnings("ignore", category=PTBUserWarning)
load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
API_BASE  = os.getenv("API_BASE_URL", "http://localhost:8000")
SCHOOL_NAME = os.getenv("SCHOOL_NAME", "Our School")

PICKING_CLASS = 1


# ─────────────────────────────────────────────────────────────────────────────
# Keyboards
# ─────────────────────────────────────────────────────────────────────────────

def main_menu(has_class: bool = True) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton("📚  Homework",          callback_data="hw_mine")],
        [InlineKeyboardButton("🗓  Upcoming Holidays",  callback_data="menu_holidays")],
    ]
    if has_class:
        rows.append([InlineKeyboardButton("✏️  Change Class",  callback_data="change_class")])
    rows.append([InlineKeyboardButton("ℹ️  About",             callback_data="menu_about")])
    return InlineKeyboardMarkup(rows)


def back_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("‹  Back to Menu", callback_data="menu_back")
    ]])


# ─────────────────────────────────────────────────────────────────────────────
# Formatting helpers
# ─────────────────────────────────────────────────────────────────────────────

def divider() -> str:
    return "─" * 28

def today_str() -> str:
    return datetime.now().strftime("%A, %d %B %Y")

def escape(text: str) -> str:
    """Escape special MarkdownV2 characters."""
    for ch in r"\_*[]()~`>#+-=|{}.!":
        text = text.replace(ch, f"\\{ch}")
    return text


# ─────────────────────────────────────────────────────────────────────────────
# API helpers
# ─────────────────────────────────────────────────────────────────────────────

async def api_get(path: str):
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{API_BASE}{path}", timeout=8)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning(f"GET {path} failed: {e}")
        return None


async def api_post(path: str, data: dict):
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{API_BASE}{path}", json=data, timeout=8)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning(f"POST {path} failed: {e}")
        return None


async def api_patch(path: str, data: dict):
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(f"{API_BASE}{path}", json=data, timeout=8)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning(f"PATCH {path} failed: {e}")
        return None


async def get_subscriber(telegram_id: str):
    return await api_get(f"/api/subscribers/{telegram_id}")


async def register_subscriber(user):
    return await api_post("/api/subscribers", {
        "telegram_id": str(user.id),
        "first_name":  user.first_name,
        "username":    user.username,
    })


async def save_class(telegram_id: str, class_code: str):
    return await api_patch(
        f"/api/subscribers/{telegram_id}/class",
        {"telegram_id": telegram_id, "class_code": class_code},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Class picker
# ─────────────────────────────────────────────────────────────────────────────

async def show_class_picker(target, first_name: str = "", first_time: bool = False):
    classes = await api_get("/api/classes")

    if not classes:
        msg = (
            "⚠️ *No Classes Available*\n\n"
            f"{divider()}\n"
            "No classes have been set up yet.\n"
            "Please contact the school office for assistance."
        )
        if hasattr(target, "edit_message_text"):
            await target.edit_message_text(msg, parse_mode="Markdown")
        else:
            await target.reply_text(msg, parse_mode="Markdown")
        return False

    buttons, row = [], []
    for cls in classes:
        row.append(InlineKeyboardButton(
            f"🏫  {cls['name']}",
            callback_data=f"pick:{cls['code']}"
        ))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)

    if first_time:
        text = (
            f"👋 *Welcome, {first_name}!*\n\n"
            f"{divider()}\n"
            "To get started, please select your\n"
            "child's class from the list below:\n\n"
            "_You only need to do this once._"
        )
    else:
        text = (
            "✏️ *Change Class*\n\n"
            f"{divider()}\n"
            "Select your child's new class:"
        )

    keyboard = InlineKeyboardMarkup(buttons)
    if hasattr(target, "edit_message_text"):
        await target.edit_message_text(text, parse_mode="Markdown", reply_markup=keyboard)
    else:
        await target.reply_text(text, parse_mode="Markdown", reply_markup=keyboard)
    return True


# ─────────────────────────────────────────────────────────────────────────────
# /start
# ─────────────────────────────────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await register_subscriber(user)
    sub = await get_subscriber(str(user.id))
    has_class = bool(sub and sub.get("class_code"))

    if has_class:
        class_code = sub["class_code"]
        text = (
            f"👋 *Welcome back, {user.first_name}!*\n\n"
            f"{divider()}\n"
            f"🏫  Class:  *{class_code}*\n"
            f"📅  Today:  {today_str()}\n"
            f"{divider()}\n\n"
            "How can I help you today?"
        )
        await update.message.reply_text(
            text,
            parse_mode="Markdown",
            reply_markup=main_menu(has_class=True),
        )
        return ConversationHandler.END
    else:
        await show_class_picker(update.message, user.first_name, first_time=True)
        return PICKING_CLASS


# ─────────────────────────────────────────────────────────────────────────────
# Button handler
# ─────────────────────────────────────────────────────────────────────────────

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # ── Class selected from picker ───────────────────────────────────────────
    if query.data.startswith("pick:"):
        code   = query.data.split(":", 1)[1]
        result = await save_class(str(user.id), code)
        if result is None:
            await query.edit_message_text(
                "⚠️ *Error*\n\nCould not save your class. Please try /start again.",
                parse_mode="Markdown",
            )
            return ConversationHandler.END

        text = (
            f"✅ *Class Registered*\n\n"
            f"{divider()}\n"
            f"🏫  Your child's class:  *{code}*\n"
            f"{divider()}\n\n"
            "All set! I'll remember this for next time.\n"
            "You can change it anytime from the menu."
        )
        await query.edit_message_text(
            text,
            parse_mode="Markdown",
            reply_markup=main_menu(has_class=True),
        )
        return ConversationHandler.END

    # ── Homework ─────────────────────────────────────────────────────────────
    elif query.data == "hw_mine":
        sub = await get_subscriber(str(user.id))
        if not sub or not sub.get("class_code"):
            await show_class_picker(query, user.first_name, first_time=True)
            return PICKING_CLASS
        await query.edit_message_text(
            "⏳ Fetching homework, please wait…",
            parse_mode="Markdown",
        )
        await show_homework(query, sub["class_code"])

    # ── Change class ─────────────────────────────────────────────────────────
    elif query.data == "change_class":
        await show_class_picker(query, user.first_name, first_time=False)
        return PICKING_CLASS

    # ── Holidays ─────────────────────────────────────────────────────────────
    elif query.data == "menu_holidays":
        await show_holidays(query)

    # ── About ────────────────────────────────────────────────────────────────
    elif query.data == "menu_about":
        text = (
            f"ℹ️ *About This Bot*\n\n"
            f"{divider()}\n"
            f"🏫  *{SCHOOL_NAME}*\n"
            f"{divider()}\n\n"
            "This bot helps parents stay informed about:\n\n"
            "📚  Daily homework assignments\n"
            "🗓  Upcoming school holidays\n"
            "📢  Important school announcements\n\n"
            f"{divider()}\n"
            "For support, please contact the school office."
        )
        await query.edit_message_text(
            text,
            parse_mode="Markdown",
            reply_markup=back_menu(),
        )

    # ── Back to menu ─────────────────────────────────────────────────────────
    elif query.data == "menu_back":
        sub = await get_subscriber(str(user.id))
        has_class = bool(sub and sub.get("class_code"))
        class_line = f"🏫  Class:  *{sub['class_code']}*\n" if has_class else ""
        text = (
            f"🏠 *Main Menu*\n\n"
            f"{divider()}\n"
            f"{class_line}"
            f"📅  Today:  {today_str()}\n"
            f"{divider()}\n\n"
            "How can I help you today?"
        )
        await query.edit_message_text(
            text,
            parse_mode="Markdown",
            reply_markup=main_menu(has_class=has_class),
        )

    return ConversationHandler.END


# ─────────────────────────────────────────────────────────────────────────────
# Show homework
# ─────────────────────────────────────────────────────────────────────────────

async def show_homework(query, class_code: str):
    data = await api_get(f"/api/homework/{class_code}")

    if data is None:
        await query.edit_message_text(
            "❌ *Class Not Found*\n\n"
            "Your class could not be found in the system.\n"
            "Please tap *Change Class* from the menu to update it.",
            parse_mode="Markdown",
            reply_markup=back_menu(),
        )
        return

    if not data:
        text = (
            f"📚 *Homework — Class {class_code}*\n\n"
            f"{divider()}\n"
            f"📅  {today_str()}\n"
            f"{divider()}\n\n"
            "✅  No homework has been assigned yet today.\n\n"
            "_Check back later or contact your teacher._"
        )
        await query.edit_message_text(
            text,
            parse_mode="Markdown",
            reply_markup=back_menu(),
        )
        return

    # Build the homework message
    count = len(data)
    lines = [
        f"📚 *Homework — Class {class_code}*",
        f"{divider()}",
        f"📅  {today_str()}",
        f"📋  {count} assignment{'s' if count > 1 else ''} found",
        f"{divider()}",
        "",
    ]

    for i, hw in enumerate(data, 1):
        lines.append(f"*{i}\\. {hw['subject']}*")
        lines.append(f"📝  {hw['description']}")
        lines.append(f"📅  Due: *{hw['due_date']}*")
        lines.append(f"👩‍🏫  Teacher: {hw['submitted_by']}")
        if hw.get("file_name"):
            lines.append(f"📎  Attachment included ↓")
        if i < count:
            lines.append(f"{divider()}")
        lines.append("")

    lines.append(f"{divider()}")
    lines.append("_Tap any attachment below to download it._")

    text = "\n".join(lines)

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=back_menu(),
    )

    # Send attached files
    files_sent = 0
    for hw in data:
        if hw.get("file_url") and hw.get("file_name"):
            try:
                async with httpx.AsyncClient() as client:
                    file_resp = await client.get(hw["file_url"], timeout=15)
                    if file_resp.status_code == 200:
                        file_bytes = io.BytesIO(file_resp.content)
                        file_bytes.name = hw["file_name"]
                        caption = (
                            f"📎 *{hw['subject']}*\n"
                            f"{hw['file_name']}\n"
                            f"_Due: {hw['due_date']}_"
                        )
                        await query.message.chat.send_document(
                            document=InputFile(file_bytes, filename=hw["file_name"]),
                            caption=caption,
                            parse_mode="Markdown",
                        )
                        files_sent += 1
            except Exception as e:
                logger.warning(f"Could not send file {hw['file_name']}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Show holidays
# ─────────────────────────────────────────────────────────────────────────────

async def show_holidays(query):
    data = await api_get("/api/holidays")

    if not data:
        text = (
            f"🗓 *Upcoming Holidays*\n\n"
            f"{divider()}\n\n"
            "No upcoming holidays are scheduled at this time.\n\n"
            "_Check back later for updates._"
        )
    else:
        lines = [
            "🗓 *Upcoming Holidays*",
            f"{divider()}",
            f"📅  {today_str()}",
            f"{divider()}",
            "",
        ]
        for i, h in enumerate(data, 1):
            lines.append(f"*{i}\\. {h['title']}*")
            if h["start_date"] == h["end_date"]:
                lines.append(f"📅  Date: *{h['start_date']}*")
            else:
                lines.append(f"📅  From: *{h['start_date']}*")
                lines.append(f"📅  To:      *{h['end_date']}*")
            if h.get("reason"):
                lines.append(f"📌  {h['reason']}")
            if i < len(data):
                lines.append(f"{divider()}")
            lines.append("")

        lines.append(f"{divider()}")
        lines.append("_All dates are subject to change._")
        text = "\n".join(lines)

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=back_menu(),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Cancel & unknown
# ─────────────────────────────────────────────────────────────────────────────

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    sub = await get_subscriber(str(update.effective_user.id))
    has_class = bool(sub and sub.get("class_code"))
    await update.message.reply_text(
        "Cancelled. Use the menu below:",
        reply_markup=main_menu(has_class=has_class),
    )
    return ConversationHandler.END


async def unknown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    sub = await get_subscriber(str(update.effective_user.id))
    has_class = bool(sub and sub.get("class_code"))
    await update.message.reply_text(
        "Please use the menu below to navigate:",
        reply_markup=main_menu(has_class=has_class),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    if not BOT_TOKEN:
        raise ValueError("TELEGRAM_BOT_TOKEN is not set in .env")

    app = Application.builder().token(BOT_TOKEN).build()

    conv = ConversationHandler(
        entry_points=[
            CommandHandler("start", start),
            CallbackQueryHandler(button_handler, pattern="^change_class$"),
            CallbackQueryHandler(button_handler, pattern="^hw_mine$"),
        ],
        states={
            PICKING_CLASS: [
                CallbackQueryHandler(button_handler, pattern="^pick:"),
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        per_chat=True,
        per_message=False,
    )

    app.add_handler(conv)
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, unknown))

    logger.info("Bot is running...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    import asyncio, sys
    if sys.version_info >= (3, 10):
        asyncio.set_event_loop(asyncio.new_event_loop())
    main()
