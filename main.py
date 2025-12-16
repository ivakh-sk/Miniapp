import os
import json
import time
import hmac
import hashlib
import secrets
import asyncio
import contextlib
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton, WebAppInfo

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip()
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "").strip()

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN не задан (задайте в .env локально или в Render Environment Variables)")
if not WEBAPP_URL:
    raise RuntimeError("WEBAPP_URL не задан (например https://<your-render-domain>/game)")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
router = Router()
dp.include_router(router)

wins = [
    (0, 1, 2), (3, 4, 5), (6, 7, 8),
    (0, 3, 6), (1, 4, 7), (2, 5, 8),
    (0, 4, 8), (2, 4, 6)
]


def _tg_validate_init_data(init_data: str, bot_token: str, max_age_sec: int = 3600) -> dict:
    if not init_data:
        raise HTTPException(status_code=403, detail="Missing initData")

    try:
        data = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid initData format")

    recv_hash = data.pop("hash", None)
    if not recv_hash:
        raise HTTPException(status_code=403, detail="Missing hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items(), key=lambda kv: kv[0]))

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode(),
        digestmod=hashlib.sha256
    ).digest()

    calc_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calc_hash, recv_hash):
        raise HTTPException(status_code=403, detail="Invalid initData hash")

    auth_date = int(data.get("auth_date", "0"))
    now = int(time.time())
    if auth_date <= 0 or (now - auth_date) > max_age_sec:
        raise HTTPException(status_code=403, detail="initData expired")

    return data


def _get_user_id_from_init_data(init_data: str) -> int:
    data = _tg_validate_init_data(init_data, BOT_TOKEN, max_age_sec=3600)
    user_raw = data.get("user")
    if not user_raw:
        raise HTTPException(status_code=403, detail="No user in initData")
    try:
        user = json.loads(user_raw)
        return int(user["id"])
    except Exception:
        raise HTTPException(status_code=403, detail="Bad user payload")


def _promo_code_5_digits() -> str:
    return str(secrets.randbelow(100000)).zfill(5)


async def _notify(text: str, user_chat_id: int):
    # Сообщение игроку
    await bot.send_message(chat_id=user_chat_id, text=text)

    # Опционально — в админский чат (если задан)
    if ADMIN_CHAT_ID:
        with contextlib.suppress(Exception):
            await bot.send_message(chat_id=int(ADMIN_CHAT_ID), text=text)


@router.message(CommandStart())
async def cmd_start(message: Message):
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="Играть", web_app=WebAppInfo(url=WEBAPP_URL))]],
        resize_keyboard=True
    )
    await message.answer(
        "Откройте игру кнопкой «Играть». Победа выдаёт промокод.",
        reply_markup=kb
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Важно запускать uvicorn с workers=1, иначе polling запустится несколько раз.
    task = asyncio.create_task(dp.start_polling(bot))
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(Exception):
            await task


app = FastAPI(lifespan=lifespan)

# Mini App по адресу /game
app.mount("/game", StaticFiles(directory="public", html=True), name="game")


@app.post("/api/win")
async def api_win(x_tg_init_data: str = Header(default="", alias="X-Tg-Init-Data")):
    user_id = _get_user_id_from_init_data(x_tg_init_data)
    code = _promo_code_5_digits()

    # 1) Всегда возвращаем код
    # 2) Уведомление в Telegram — не должно ломать выдачу промокода
    notify_error = None
    try:
        await _notify(f"Победа! Промокод выдан: {code}", user_chat_id=user_id)
    except Exception as e:
        notify_error = str(e)

    return {"ok": True, "code": code, "notify_ok": notify_error is None, "notify_error": notify_error}


@app.post("/api/lose")
async def api_lose(x_tg_init_data: str = Header(default="", alias="X-Tg-Init-Data")):
    user_id = _get_user_id_from_init_data(x_tg_init_data)

    # Проигрыш тоже не должен падать из-за отправки сообщения
    notify_error = None
    try:
        await _notify("Проигрыш", user_chat_id=user_id)
    except Exception as e:
        notify_error = str(e)

    return {"ok": True, "notify_ok": notify_error is None, "notify_error": notify_error}



@app.get("/api/health")
async def api_health():
    return {"ok": True}
