// KnuSentiLex 감성 분석기 - Kiwi 형태소 분석기 연동 버전
// 출처: 군산대학교 소프트웨어융합공학과 Data Intelligence Lab - KnuSentiLex
// 개선: WASM 기반 Kiwi 형태소 분석기를 사용하여 한국어 실질 형태소 매칭 방식 적용

import { KiwiBuilder } from './lib/kiwi/index.js';

// ─── 기본 API 설정 (설정 창에서 변경 가능) ───────────────────────────────────
const DEFAULT_API_KEY = '';
const DEFAULT_MODEL   = 'gemini-2.5-flash-lite';
// ─────────────────────────────────────────────────────────────────────────────

let kiwiInstance = null;
const dictMorphemeMap = new Map(); // 형태소 키 -> 사전 항목 매핑

const modelFiles = [
  'combiningRule.txt',
  'cong.mdl',
  'default.dict',
  'dialect.dict',
  'extract.mdl',
  'multi.dict',
  'nounchr.mdl',
  'sj.morph',
  'typo.dict'
];

// 모델 파일 비동기 로드 및 진행 상황 통보
async function loadModelFiles() {
  const modelFilesData = {};
  const totalFiles = modelFiles.length;
  let loadedFiles = 0;

  const updateProgress = (filename) => {
    loadedFiles++;
    const progress = Math.round((loadedFiles / totalFiles) * 100);
    window.dispatchEvent(new CustomEvent('kiwi-loading-progress', {
      detail: { progress, filename }
    }));
  };

  await Promise.all(modelFiles.map(async file => {
    const res = await fetch(`./models/${file}`);
    if (!res.ok) throw new Error(`Failed to load model file: ${file}`);
    const buf = await res.arrayBuffer();
    modelFilesData[file] = new Uint8Array(buf);
    updateProgress(file);
  }));
  return modelFilesData;
}

// 품사 태그 리스트를 분석하여 문법적 어미(E), 조사(J), 부호(S)를 제외한 실질 형태소 키 생성
function getMorphemeKey(tokens) {
  const filtered = tokens.filter(t =>
    !t.tag.startsWith('E') &&
    !t.tag.startsWith('J') &&
    !t.tag.startsWith('S')
  );
  if (filtered.length === 0) {
    return tokens.map(t => `${t.str}/${t.tag}`).join('+');
  }
  return filtered.map(t => `${t.str}/${t.tag}`).join('+');
}

// HTML 이스케이프 유틸리티
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// 감성 분석 엔진 초기화
export async function initEngine() {
  if (!window.SENTI_DATA || !Array.isArray(window.SENTI_DATA)) {
    console.error("감성 사전 데이터를 찾을 수 없습니다. (senti_data.js 로드 필요)");
    return false;
  }

  try {
    const modelFilesData = await loadModelFiles();
    const builder = await KiwiBuilder.create('./lib/kiwi/kiwi-wasm.wasm');

    // 사전에 등록된 모든 단어(2글자 이상, 공백 없음)를 사용자 단어(userWords)로 등록하여 오분석(예: '가래' -> '가/VV + 래') 및 키 충돌을 원천 방지
    const userWords = [];
    window.SENTI_DATA.forEach(item => {
      if (!item || !item.word) return;
      const word = item.word.trim();
      if (!word || word.includes(' ') || word.length < 2) return;

      let tag = 'NNG'; // 기본 명사
      if (word.endsWith('하다') || word.endsWith('스럽다') || word.endsWith('대다') || word.endsWith('있다') || word.endsWith('없다')) {
        tag = 'VA'; // 형용사/동사류
      }
      userWords.push({ word, tag, score: 10 });
    });

    kiwiInstance = await builder.build({
      modelFiles: modelFilesData,
      modelType: 'cong',
      loadDefaultDict: true,
      loadTypoDict: true,
      loadMultiDict: false,
      userWords
    });

    console.log("Kiwi WASM 빌드 완료. 사전 인덱싱 시작...");

    dictMorphemeMap.clear();
    window.SENTI_DATA.forEach(item => {
      if (!item || !item.word) return;
      const word = item.word.trim();
      if (!word) return;

      const polarity = parseInt(item.polarity, 10);
      const entry = {
        word: word,
        word_root: item.word_root || word,
        polarity: isNaN(polarity) ? 0 : polarity
      };

      const tokens = kiwiInstance.tokenize(word);
      const key = getMorphemeKey(tokens);

      if (!key) return;

      // 동일 키 충돌 시 감성 수치가 더 큰 것 우선 보존
      if (!dictMorphemeMap.has(key)) {
        dictMorphemeMap.set(key, entry);
      } else {
        const existing = dictMorphemeMap.get(key);
        if (Math.abs(entry.polarity) > Math.abs(existing.polarity)) {
          dictMorphemeMap.set(key, entry);
        }
      }
    });

    console.log(`Kiwi 기반 감성 사전 인덱싱 완료: ${dictMorphemeMap.size}개 형태소 키 등록됨.`);
    window.dispatchEvent(new CustomEvent('kiwi-loaded'));
    return true;
  } catch (error) {
    console.error("Kiwi 초기화 중 에러 발생:", error);
    window.dispatchEvent(new CustomEvent('kiwi-load-error', { detail: { error } }));
    return false;
  }
}

// 로컬 형태소 기반 감성 분석 실행 (헬퍼 함수)
function analyzeLocalSentiment(text) {
  if (!kiwiInstance) {
    console.warn("Kiwi가 아직 초기화되지 않았습니다.");
    return {
      totalScore: 0,
      matchedCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      details: [],
      highlightedHtml: escapeHtml(text)
    };
  }

  const tokens = kiwiInstance.tokenize(text);
  const MAX_NGRAM = 8;
  const details = [];
  let i = 0;

  while (i < tokens.length) {
    // 조사, 어미, 부호(E, J, S)로 시작하는 N-gram 매칭을 원천 차단하여 이전 단어의 어미가 매칭 스팬에 포함되는 버그 방지
    const firstTok = tokens[i];
    if (firstTok.tag.startsWith('E') || firstTok.tag.startsWith('J') || firstTok.tag.startsWith('S')) {
      i++;
      continue;
    }

    let matched = false;

    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1; n--) {
      const slice = tokens.slice(i, i + n);
      const key = getMorphemeKey(slice);

      if (dictMorphemeMap.has(key)) {
        const info = dictMorphemeMap.get(key);
        const startChar = slice[0].position;
        const endChar = slice[slice.length - 1].position + slice[slice.length - 1].length;
        const matchedText = text.substring(startChar, endChar);

        details.push({
          start: startChar,
          end: endChar,
          word: matchedText,
          originalDictWord: info.word,
          polarity: info.polarity,
          word_root: info.word_root,
          matchType: 'morpheme',
          key: key
        });

        i += n;
        matched = true;
        break;
      }

      // 단일 형태소 매칭 실패 시: 접두사 슬라이딩 백오프 적용 (예: '보람차/VA' -> '보람/NNG')
      if (n === 1) {
        const tok = slice[0];
        const str = tok.str;
        let foundPrefix = false;

        for (let len = str.length - 1; len >= 2; len--) {
          const prefix = str.substring(0, len);
          const possibleTags = ['NNG', 'NNP', 'VV', 'VA', 'XR', 'MAG'];

          for (const tag of possibleTags) {
            const testKey = `${prefix}/${tag}`;
            if (dictMorphemeMap.has(testKey)) {
              const info = dictMorphemeMap.get(testKey);
              const startChar = tok.position;
              const endChar = tok.position + len;
              const matchedText = text.substring(startChar, endChar);

              details.push({
                start: startChar,
                end: endChar,
                word: matchedText,
                originalDictWord: info.word,
                polarity: info.polarity,
                word_root: info.word_root,
                matchType: 'morpheme_prefix',
                key: testKey
              });

              i += 1;
              matched = true;
              foundPrefix = true;
              break;
            }
          }
          if (foundPrefix) break;
        }
      }
    }

    if (!matched) {
      i++;
    }
  }

  let totalScore = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  details.forEach(item => {
    totalScore += item.polarity;
    if (item.polarity > 0) positiveCount++;
    else if (item.polarity < 0) negativeCount++;
    else neutralCount++;
  });

  let highlightedHtml = '';
  let lastIdx = 0;

  details.forEach(item => {
    highlightedHtml += escapeHtml(text.substring(lastIdx, item.start));

    let className = 'highlight-neutral';
    let polarityLabel = '중립';
    if (item.polarity > 0) {
      className = item.polarity === 2 ? 'highlight-pos-strong' : 'highlight-pos';
      polarityLabel = `긍정 (+${item.polarity})`;
    } else if (item.polarity < 0) {
      className = item.polarity === -2 ? 'highlight-neg-strong' : 'highlight-neg';
      polarityLabel = `부정 (${item.polarity})`;
    }

    highlightedHtml += `<span class="highlight-word ${className}" data-word="${escapeHtml(item.word)}" data-root="${escapeHtml(item.word_root)}" data-score="${item.polarity}" title="사전 단어: ${escapeHtml(item.originalDictWord)} / 어근: ${escapeHtml(item.word_root)} (${polarityLabel})">${escapeHtml(item.word)}</span>`;
    lastIdx = item.end;
  });

  highlightedHtml += escapeHtml(text.substring(lastIdx));

  return {
    totalScore,
    matchedCount: details.length,
    positiveCount,
    negativeCount,
    neutralCount,
    details,
    highlightedHtml
  };
}

// API Key 연결 테스트용 함수
export async function testApiKey(apiKey, model) {
  const modelName = model || DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: '안녕' }] }]
      })
    });
    return res.ok;
  } catch (e) {
    console.error('API Key Test Failed:', e);
    return false;
  }
}

// 하이브리드 감성 분석 실행 (로컬 vs Gemini)
export async function analyzeSentiment(text) {
  // localStorage 우선, 없으면 소스 코드 상수 사용
  const apiKey = localStorage.getItem('gemini_api_key') || DEFAULT_API_KEY;
  const modelName = localStorage.getItem('gemini_model') || DEFAULT_MODEL;
  const useApi = localStorage.getItem('gemini_use_api') !== 'false';

  // API 키가 없거나 AI 활성화가 꺼져 있으면 로컬 분석 실행
  if (!apiKey || !useApi) {
    const localResult = analyzeLocalSentiment(text);
    return {
      isLlm: false,
      ...localResult
    };
  }

  // API 키가 있으면 Gemini API 호출 + 백그라운드 로컬 Kiwi 정보 병합
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const promptBody = {
    contents: [
      {
        parts: [
          {
            text: `다음 한국어 문장을 분석하여 감성 점수와 분석 사유를 제공해 주세요:\n"${text}"`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          totalScore: {
            type: "NUMBER",
            description: "-2.0(매우 부정)에서 +2.0(매우 긍정) 사이의 감성 종합 점수"
          },
          sentiment: {
            type: "STRING",
            enum: ["매우 긍정", "긍정", "중립", "부정", "매우 부정"]
          },
          summary: {
            type: "STRING",
            description: "문장의 전체적인 감성에 대한 1~2줄 요약 설명"
          },
          keyPhrases: {
            type: "ARRAY",
            description: "감성 판정에 결정적인 영향을 끼친 구절들의 목록",
            items: {
              type: "OBJECT",
              properties: {
                phrase: {
                  type: "STRING",
                  description: "감지된 핵심 구절 또는 어구"
                },
                polarity: {
                  type: "NUMBER",
                  description: "-2.0에서 +2.0 사이의 해당 구절의 감성 강도 점수"
                },
                reason: {
                  type: "STRING",
                  description: "해당 구절이 그런 감성 점수를 가지는지에 대한 문맥적 판단 이유"
                }
              },
              required: ["phrase", "polarity", "reason"]
            }
          }
        },
        required: ["totalScore", "sentiment", "summary", "keyPhrases"]
      }
    },
    systemInstruction: {
      parts: [
        {
          text: "당신은 한국어 문장을 분석하여 감성을 수치화하고 해석하는 감성 분석 전문가입니다. 문맥의 흐름, 비유, 반어법, 이중 부정 등을 파악하여 정확한 감정 강도를 점수화하고 이유를 제공해야 합니다."
        }
      ]
    }
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptBody)
    });

    if (!res.ok) {
      throw new Error(`Gemini API Error (status: ${res.status})`);
    }

    const data = await res.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error("API 응답 형식이 올바르지 않습니다.");
    }

    const llmResult = JSON.parse(resultText);

    // 로컬 Kiwi 형태소 분석도 수행하여 하이라이팅 및 사전 단어 상세 정보 가져오기
    const localResult = analyzeLocalSentiment(text);

    return {
      isLlm: true,
      totalScore: llmResult.totalScore,
      sentiment: llmResult.sentiment,
      llm: llmResult,
      // 로컬 Kiwi 결과 병합
      matchedCount: localResult.matchedCount,
      positiveCount: localResult.positiveCount,
      negativeCount: localResult.negativeCount,
      neutralCount: localResult.neutralCount,
      details: localResult.details,
      highlightedHtml: localResult.highlightedHtml
    };
  } catch (error) {
    console.error("Gemini API 호출 중 오류 발생. 로컬 엔진으로 폴백합니다:", error);
    // Gemini API 호출에 실패할 경우 자동으로 로컬 엔진 결과 반환
    const localResult = analyzeLocalSentiment(text);
    return {
      isLlm: false,
      ...localResult,
      fallbackError: error.message
    };
  }
}

// 사전 검색 기능 (텍스트 매칭 + 형태소 키 유사도 매칭)
export function searchDictionary(keyword) {
  if (!kiwiInstance) return [];

  const keywordClean = keyword.trim().toLowerCase();
  if (!keywordClean) return [];

  const keywordTokens = kiwiInstance.tokenize(keywordClean);
  const keywordKey = getMorphemeKey(keywordTokens);

  const results = [];

  window.SENTI_DATA.forEach(item => {
    if (!item || !item.word) return;
    const word = item.word.toLowerCase();
    const root = (item.word_root || '').toLowerCase();

    let isMatch = word.includes(keywordClean) || root.includes(keywordClean);

    if (!isMatch && keywordKey) {
      const tokens = kiwiInstance.tokenize(item.word);
      const key = getMorphemeKey(tokens);
      if (key && key.includes(keywordKey)) {
        isMatch = true;
      }
    }

    if (isMatch) {
      results.push({
        word: item.word,
        word_root: item.word_root || item.word,
        polarity: parseInt(item.polarity, 10) || 0
      });
    }
  });

  return results.sort((a, b) => {
    const aExact = a.word.toLowerCase() === keywordClean;
    const bExact = b.word.toLowerCase() === keywordClean;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return a.word.length - b.word.length;
  });
}

// 글로벌 window 객체에 바인딩하여 HTML 내 기존 스크립트와의 호환성 유지
window.initEngine = initEngine;
window.analyzeSentiment = analyzeSentiment;
window.searchDictionary = searchDictionary;
window.escapeHtml = escapeHtml;
window.testApiKey = testApiKey;

// 자동 초기화 실행
initEngine();

