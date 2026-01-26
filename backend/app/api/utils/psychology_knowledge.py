from typing import List, Dict

class PsychologyKnowledge:
    def __init__(self):
        # 这里可以加载本地TXT或向量数据库
        # 为了演示，我们使用简单的硬编码知识库
        self.knowledge_base = {
            "焦虑": "焦虑是一种常见的情绪反应，通常是对未来不确定性的担忧。适度的焦虑可以提高警觉性，但过度的焦虑会影响生活。",
            "抑郁": "抑郁不仅仅是心情不好，而是一种持续的情绪低落状态，可能伴随兴趣丧失、睡眠障碍等。",
            "压力": "压力是身体对挑战或需求的反应。学会压力管理技巧，如深呼吸、正念冥想，有助于缓解压力。",
            "失眠": "失眠可能由压力、焦虑或不良睡眠习惯引起。建立规律的作息时间非常重要。"
        }

    def search(self, query: str) -> str:
        """
        简单的关键词匹配检索
        """
        results = []
        for key, value in self.knowledge_base.items():
            if key in query:
                results.append(f"【{key}知识】: {value}")
        
        if results:
            return "\n".join(results)
        return ""

psychology_knowledge = PsychologyKnowledge()
