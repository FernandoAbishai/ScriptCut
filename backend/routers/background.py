"""Background removal capability endpoints."""

from fastapi import APIRouter

from services.background_removal import capabilities

router = APIRouter()


@router.get("/background/capabilities")
async def background_capabilities():
    return capabilities()
