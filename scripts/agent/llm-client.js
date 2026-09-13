const dotenv = require('dotenv');
dotenv.config();

/**
 * Universal LLM client supporting tool-calling and fallback offline mock.
 */
class LlmClient {
  constructor(config = {}) {
    this.apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    this.model = process.env.LLM_MODEL || config.model || 'gemini-2.5-flash';
    this.maxTokens = config.maxTokens || 1500;

    const isGemini = Boolean(
      process.env.GEMINI_API_KEY ||
      (this.apiKey && this.apiKey.startsWith('AIzaSy')) ||
      (this.model && this.model.toLowerCase().includes('gemini'))
    );

    const defaultEndpoint = isGemini
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    this.endpoint = process.env.LLM_ENDPOINT || defaultEndpoint;
  }

  isMockMode() {
    return !this.apiKey || process.argv.includes('--mock');
  }

  async runAgentStep(messages, availableTools = []) {
    if (this.isMockMode()) {
      return {
        role: 'assistant',
        content: null,
        mockBriefing: true
      };
    }

    const payload = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: 0.2
    };

    if (availableTools.length > 0) {
      payload.tools = availableTools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`[LlmClient] API call failed (${res.status}): ${errorText}. Falling back to deterministic summary.`);
        return { role: 'assistant', content: null, mockBriefing: true };
      }

      const data = await res.json();
      const choice = data.choices && data.choices[0];
      return choice ? choice.message : { role: 'assistant', content: null, mockBriefing: true };
    } catch (err) {
      console.warn(`[LlmClient] Request error: ${err.message}. Falling back to offline generation.`);
      return { role: 'assistant', content: null, mockBriefing: true };
    }
  }

  /**
   * Multimodal vision text extraction: downloads an image, encodes to base64,
   * and queries the vision model to extract text, dates, timetables, and notices.
   */
  async extractImageText(imageUrl, prompt = 'Transcribe all visible text, schedules, dates, and announcements from this image accurately.') {
    if (this.isMockMode() || !imageUrl) {
      return null;
    }

    try {
      const resImg = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VillageDaily/1.0'
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!resImg.ok) return null;

      const arrayBuffer = await resImg.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = resImg.headers.get('content-type') || 'image/jpeg';

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`
              }
            }
          ]
        }
      ];

      const response = await this.runAgentStep(messages);
      if (response && response.content && !response.mockBriefing) {
        return response.content.trim();
      }
    } catch (err) {
      console.warn(`[LlmClient] Image vision OCR error for ${imageUrl}:`, err.message);
    }
    return null;
  }

  /**
   * Extracts structured news, events, and governance items from raw document text.
   */
  async extractStructuredItems(rawText, metadata = {}) {
    if (this.isMockMode() || !rawText || rawText.trim().length < 40) {
      return null;
    }

    const placeName = metadata.placeName || 'Warboys';
    const county = metadata.county || 'Cambridgeshire';

    const systemPrompt = `You are a local news and event extractor for ${placeName}, ${county}, UK.
Analyze the provided document text and extract any real, upcoming community events, local news stories, or council/governance decisions.
CRITICAL RULES:
- Output strictly valid JSON matching this schema:
{
  "events": [
    {
      "title": "Clear event name",
      "eventDate": "YYYY-MM-DD",
      "eventTime": "e.g. Saturday 12 September • 10:00 AM",
      "venue": "Specific venue or address",
      "content": "Detailed factual description",
      "isRegular": false,
      "isWholeVillage": true/false
    }
  ],
  "news": [
    {
      "title": "Clean concise headline",
      "summary": "1-2 sentence summary",
      "content": "Full article text",
      "date": "ISO date string or YYYY-MM-DD",
      "isWholeVillage": true/false
    }
  ],
  "governance": [
    {
      "title": "Specific decision or report headline",
      "meetingTitle": "Council/committee name",
      "meetingDate": "ISO date or YYYY-MM-DD",
      "summary": "Brief factual summary of the resolution or debate",
      "priority": "HIGH or STANDARD"
    }
  ]
}
- If a school item is of general interest to all village residents (e.g. fete, open day, public youth coaching, parking/traffic issues), set isWholeVillage to true. If strictly internal to pupils/parents, set isWholeVillage to false.
- Do NOT fabricate or invent items. If no events or news are in the text, return empty arrays.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Document Title: ${metadata.title || 'Untitled'}\nSource URL: ${metadata.url || ''}\nContent:\n${rawText.slice(0, 6000)}` }
    ];

    try {
      const response = await this.runAgentStep(messages);
      if (response && response.content && !response.mockBriefing) {
        let cleanJson = response.content.trim();
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7);
        if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3);
        if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3);
        const parsed = JSON.parse(cleanJson.trim());
        return {
          events: Array.isArray(parsed.events) ? parsed.events : [],
          news: Array.isArray(parsed.news) ? parsed.news : [],
          governance: Array.isArray(parsed.governance) ? parsed.governance : [],
          planning: Array.isArray(parsed.planning) ? parsed.planning : []
        };
      }
    } catch (err) {
      console.warn(`[LlmClient] Structured extraction error:`, err.message);
    }
    return null;
  }

  /**
   * Assesses whether two event announcements describe the exact same physical event.
   */
  async assessDuplicateEvents(eventA, eventB) {
    if (this.isMockMode()) {
      return null;
    }

    const messages = [
      {
        role: 'system',
        content: `You are an event deduplication specialist. Decide if two event announcements refer to the exact same physical gathering.
Respond strictly in JSON format:
{
  "isDuplicate": true/false,
  "canonicalTitle": "Cleanest, most descriptive event title",
  "eventDate": "YYYY-MM-DD",
  "eventTime": "Merged time string",
  "venue": "Most complete venue description",
  "content": "Combined factual summary"
}`
      },
      {
        role: 'user',
        content: `Event 1:
Title: ${eventA.title}
Date: ${eventA.eventDate}
Time: ${eventA.eventTime || ''}
Venue: ${eventA.venue || ''}
Content: ${eventA.content || ''}

Event 2:
Title: ${eventB.title}
Date: ${eventB.eventDate}
Time: ${eventB.eventTime || ''}
Venue: ${eventB.venue || ''}
Content: ${eventB.content || ''}`
      }
    ];

    try {
      const response = await this.runAgentStep(messages);
      if (response && response.content && !response.mockBriefing) {
        let cleanJson = response.content.trim();
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7);
        if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3);
        if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3);
        return JSON.parse(cleanJson.trim());
      }
    } catch (err) {
      console.warn(`[LlmClient] Deduplication assessment error:`, err.message);
    }
    return null;
  }
}

module.exports = LlmClient;
