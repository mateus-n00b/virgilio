from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.crypto import decrypt, encrypt
from app.core.db import get_db, utcnow
from app.core.deps import get_current_user
from app.core.errors import AppError, not_found
from app.instructions.models import Instruction
from app.users.models import User

router = APIRouter(prefix="/me/instructions", tags=["instruções"])


class InstructionIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=1, max_length=4000)
    position: int | None = Field(default=None, ge=0, le=1000)


class InstructionOut(BaseModel):
    id: int
    title: str
    body: str
    position: int
    updated_at: datetime


def _out(i: Instruction) -> InstructionOut:
    return InstructionOut(id=i.id, title=i.title, body=decrypt(i.body_enc), position=i.position, updated_at=i.updated_at)


def _owned(db: Session, user: User, instruction_id: int) -> Instruction:
    i = db.get(Instruction, instruction_id)
    if i is None or i.user_id != user.id:
        raise not_found("Instrução")
    return i


@router.get("", response_model=list[InstructionOut])
def list_instructions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Instruction).where(Instruction.user_id == user.id).order_by(Instruction.position, Instruction.id))
    return [_out(i) for i in rows]


@router.post("", response_model=InstructionOut, status_code=201)
def create_instruction(body: InstructionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_settings()
    count = db.scalar(select(func.count()).select_from(Instruction).where(Instruction.user_id == user.id)) or 0
    if count >= s.max_instructions:
        raise AppError(409, "too_many_instructions", f"Você pode ter até {s.max_instructions} instruções.")
    position = body.position if body.position is not None else count
    i = Instruction(user_id=user.id, title=body.title.strip(), body_enc=encrypt(body.body.strip()), position=position)
    db.add(i)
    db.commit()
    return _out(i)


@router.put("/{instruction_id}", response_model=InstructionOut)
def update_instruction(instruction_id: int, body: InstructionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    i = _owned(db, user, instruction_id)
    i.title, i.body_enc, i.updated_at = body.title.strip(), encrypt(body.body.strip()), utcnow()
    if body.position is not None:
        i.position = body.position
    db.commit()
    return _out(i)


@router.delete("/{instruction_id}", status_code=204)
def delete_instruction(instruction_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    db.delete(_owned(db, user, instruction_id))
    db.commit()
