# Full self-contained Google Colab script to fine-tune NamelessAI
# Run in Colab with T4 GPU enabled:
# !pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
# !pip install --no-deps xformers trl peft accelerate bitsandbytes

from unsloth import FastLanguageModel
from datasets import Dataset
from trl import SFTTrainer
from transformers import TrainingArguments
import torch

max_seq_length = 2048
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen2.5-1.5B-Instruct",
    max_seq_length=max_seq_length,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
)

prompt_style = """Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
{}

### Response:
{}"""

EOS_TOKEN = tokenizer.eos_token

def formatting_prompts_func(examples):
    instructions = examples["instruction"]
    outputs = examples["output"]
    texts = []
    for instruction, output in zip(instructions, outputs):
        text = prompt_style.format(instruction, output) + EOS_TOKEN
        texts.append(text)
    return {"text": texts}

nameless_data = {
    "instruction": [
        "Who are you and what system powers you?",
        "Write a clean CSS glassmorphic snippet using Tailwind.",
        "How do I integrate Supabase authentication in Next.js?",
        "What are the core model tiers of Nameless Labs AI?"
    ],
    "output": [
        "I am NamelessAI, an advanced custom model developed by Mythical Studios and integrated into the Nameless Labs ecosystem.",
        "<div className='backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-xl p-6 text-white'>\n  <h3 className='text-lg font-semibold'>Dark Glassmorphism</h3>\n</div>",
        "To integrate Supabase auth in Next.js, initialize your client using `@supabase/ssr`, configure your middleware for token refreshing, and use `supabase.auth.signInWithPassword()` for login handlers.",
        "The core model tiers include Pulse 5.5 Nano, Lyric 5.5 Flash, Vega 5.5 Mini, Aether 5.5 Pro, and Quasar 5.5 Apex."
    ]
}

dataset = Dataset.from_dict(nameless_data)
dataset = dataset.map(formatting_prompts_func, batched=True)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=max_seq_length,
    dataset_num_proc=2,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=10,
        max_steps=120,
        learning_rate=2e-4,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=1,
        output_dir="nameless_outputs",
    ),
)

trainer_stats = trainer.train()

# Export to GGUF
model.save_pretrained_gguf("NamelessAI-v1", tokenizer, quantization_method="q4_k_m")
