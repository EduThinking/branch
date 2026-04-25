export async function reviewCausality(nodes: any[], edges: any[]) {
  const nodeDict = nodes.reduce((acc: any, node: any) => {
    acc[node.id] = { 
      label: node.data.label, 
      type: node.data.type,
      position: node.position 
    };
    return acc;
  }, {});

  const connections = edges.map((edge: any) => {
    const source = nodeDict[edge.source];
    const target = nodeDict[edge.target];
    return `- [${source?.label || '알 수 없음'}] (${source?.type || ''}) -> [${target?.label || '알 수 없음'}] (${target?.type || ''})`;
  }).join("\n");

  const nodesList = nodes.map((node: any) => 
    `- [${node.data.label}] (ID: ${node.id}, 타입: ${node.data.type || '일반'}, 위치: x=${Math.round(node.position.x)}, y=${Math.round(node.position.y)})`
  ).join("\n");

  const prompt = `
당신은 따뜻하고 지혜로운 문제 해결 멘토입니다. 사용자가 작성한 '인과관계 가지(Branch)'를 보고 부드럽고 친절하게 대화하듯 코칭해주세요.

### 인과관계 분석 규칙 (매우 중요):
- 사용자는 'AND 연결기호(and 타입 노드)'를 화살표 위에 올려두어 여러 원인이 결합되어야 결과가 발생함을 표현합니다.
- 만약 특정 결과 노드로 향하는 화살표들이 있고, 그 근처에 'AND' 기호가 있다면, AI는 이를 "이 원인들이 '동시에' 충족되어야 저 결과가 나온다"라고 해석해야 합니다.
- 단순한 선 연결뿐만 아니라, 기호의 위치를 보고 사용자의 의도를 파악하세요.

### 현재 구조:
Nodes (각 노드의 위치와 타입):
${nodesList}

Connections (직접적인 선 연결):
${connections}

### 코칭 가이드:
1. "딱딱한 전문가"가 아니라 "함께 고민해주는 파트너"가 되어주세요.
2. 분석 위주보다는 질문을 던져서 사용자가 스스로 생각하게 유도해주세요.
3. 칭찬을 곁들여주시고, 핵심 포인트는 3가지 이내로 친절하게 제안해주세요.
4. 'AND' 기호가 사용되었다면 그 논리적 결합(A와 B가 모두 있어야 C가 됨)이 타당한지 특히 세밀하게 살펴봐주세요.

**중요**: 한국어로 답변하고, 친근한 말투(~해요, ~일까요? 등)를 사용하세요. Markdown 형식을 사용하세요.
`;

  try {
    const response = await fetch("/api/review-causality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "알 수 없는 서버 오류" }));
      console.error("API Response Error:", errorData);
      return `검토 중 오류가 발생했어요: ${errorData.error || "서버 응답 오류"}`;
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Fetch Error:", error);
    return "서버와 연결하는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주시겠어요?";
  }
}

export async function reviewSolutions(nodes: any[], edges: any[]) {
  const solutions = nodes.filter((n: any) => n.data.type === 'solution').map((n: any) => n.data.label);
  const context = nodes.filter((n: any) => n.data.type !== 'solution').map((n: any) => `- ${n.data.label} (${n.data.type})`).join('\n');

  if (solutions.length === 0) {
    return "아직 '해결책 상자'가 보이지 않네요! 어떤 방법으로 문제를 해결해보고 싶으신가요? 노란색 상자를 추가해서 적어주시면 제가 함께 고민해드릴게요.";
  }

  const prompt = `
당신은 실행 중심의 다정한 아이디어 코치입니다. 사용자가 도출한 '해결책'들을 검토하고 피드백을 주세요.

### 현재 상황 (인과 관계 맥락):
${context}

### 제안된 해결책:
${solutions.map(s => `- ${s}`).join('\n')}

### 코칭 가이드:
1. 해결책 하나하나에 대해 따뜻한 격려를 먼저 해주세요.
2. 이 해결책이 정말 '근본 원인'을 해결할 수 있을지 구체적인 질문을 던져주세요.
3. 더 구체적인 실행 방안(How)을 생각해보게 하는 질문을 1~2개 포함해주세요.
4. 전체적인 해결의 흐름에 대해 응원하는 메시지로 마무리해주세요.

**중요**: 한국어로 답변하고, 아주 다정하고 부드러운 말투를 사용하세요. Markdown 형식을 사용하세요.
`;

  try {
    const response = await fetch("/api/review-solutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "알 수 없는 서버 오류" }));
      console.error("API Response Error:", errorData);
      return `해결책 검토 중 오류가 발생했어요: ${errorData.error || "서버 응답 오류"}`;
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Fetch Error:", error);
    return "서버와 연결하는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주시겠어요?";
  }
}
