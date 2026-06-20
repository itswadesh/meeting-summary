import ollama

def generate_offline_summary(raw_transcript: str) -> str:
    """
    Sends the raw transcript to the local Ollama instance running Llama 3.
    """
    print("\n[AI Engine] Analyzing raw meeting notes via local Ollama...")
    
    # Strict prompt layout enforcing deadlines, tasks, problems, solutions, and your anti-hallucination guardrail
    system_instruction = (
        "You are an elite corporate secretary on a highly secure intranet network. "
        "Your task is to organize messy, unstructured meeting text.\n\n"
        "CRITICAL RULE: If the transcript consists of repetitive nonsense, song lyrics, "
        "a single word repeated over and over, or does not contain any actual corporate "
        "discussion, DO NOT invent a fake meeting. Instead, respond with a polite message stating "
        "that the audio did not contain a clear spoken meeting conversation.\n\n"
        "If it IS a real meeting, you must output exactly these clear markdown sections:\n"
        "1. ## Executive Summary (A concise overview of the conversation)\n"
        "2. ## Problems Identified & Challenges\n"
        "3. ## Solutions Proposed & Decisions Made\n"
        "4. ## Action Items, Assignments & Deadlines (Format explicitly as '[Name] - Task - Deadline')"
    )
    
    try:
        response = ollama.chat(
            model='llama3',
            messages=[
                {'role': 'system', 'content': system_instruction},
                {'role': 'user', 'content': f"Here are the meeting notes:\n{raw_transcript}"}
            ]
        )
        return response.message.content
    except Exception as e:
        return f"Error connecting to local Ollama service: {str(e)}"

if __name__ == "__main__":
    # Quick sanity check validation pipeline
    mock_notes = "Alex said the server is crashing. Sarah suggested upgrading RAM by Friday morning."
    print(generate_offline_summary(mock_notes))