from abc import ABC, abstractmethod
from typing import List, Dict, Any

class LLMClient(ABC): 
    @abstractmethod
    def chat_completion(
        self, messages: List[Dict[str, str]],
        thinking_enabled: bool = False
    ) -> Dict[str, Any]:
        """
        Send a chat completion request to the LLM provider.
        
        :param messages: List of message dictionaries (role, content).
        :param thinking_enabled: Whether to enable "thinking" or "reasoning" mode.
        :return: The response dictionary from the API.
        """
        pass

    @abstractmethod
    def chat_completion_stream(
        self, messages: List[Dict[str, str]],
        thinking_enabled: bool = False
    ):
        """
        Send a streaming chat completion request to the LLM provider.
        Yields chunks of content.
        """
        pass
