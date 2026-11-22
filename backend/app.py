import os
import sys

# Ensure backend root is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gradio as gr
from app.main import app as fastapi_app

# Gradio interface for Hugging Face Space health check
with gr.Blocks(title="VERTEX CONNECT API") as demo:
    gr.Markdown("# ⚡ VERTEX CONNECT Cloud Backend API")
    gr.Markdown("24/7 High-Speed Cloud Backend Active & Healthy.")
    gr.Markdown("Directly integrated with Cloudflare D1 Database & LiveKit WebRTC Cloud.")

# Mount Gradio into FastAPI root
app = gr.mount_gradio_app(fastapi_app, demo, path="/status")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(fastapi_app, host="0.0.0.0", port=7860)
