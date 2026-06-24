import ollama

def generate_offline_summary(raw_transcript: str) -> str:
    """
    Sends the raw transcript to the local Ollama instance running Llama 3.
    """
    print("\n[AI Engine] Analyzing raw meeting notes via local Ollama...")
    
    # Strict prompt layout enforcing deadlines, tasks, problems, solutions, and your anti-hallucination guardrail
    system_instruction = (
        "You are an elite corporate secretary on a highly secure intranet network. "
        "Your task is to organize conversational, unstructured meeting transcripts into professional minutes.\n\n"
        "CRITICAL RULE: Only reject the transcript if it is absolute garbage, such as a single word "
        "repeated dozens of times, pure static noise text, or completely unreadable gibberish. "
        "If there is ANY mention of tasks, dates, technology, or project status (even if brief or conversational), "
        "do NOT reject it. Treat it as a valid meeting.\n\n"
        "If it is a valid meeting, you must output exactly these clear markdown sections:\n"
        "1. ## Executive Summary\n"
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