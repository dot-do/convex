/**
 * @module FullTextSearch
 *
 * Full-text search implementation for the Convex query system.
 *
 * Provides full-text search capabilities with:
 * - Text tokenization and normalization
 * - Relevance ranking (TF-IDF-like scoring)
 * - Fuzzy matching with edit distance
 * - Prefix matching
 * - Phrase search with quotes
 * - Filter field support
 */

import type { SearchFilterBuilder } from '../database/QueryBuilder'

// ============================================================================
// Types
// ============================================================================

/**
 * Search configuration for a search index.
 */
export interface SearchIndexConfig {
  /** Name of the search index */
  name: string
  /** Field containing the searchable text */
  searchField: string
  /** Fields that can be used for equality filtering */
  filterFields: string[]
}

/**
 * Search filter state accumulated from SearchFilterBuilder calls.
 */
export interface SearchFilterState {
  /** The field to search */
  searchField: string | null
  /** The search query string */
  searchQuery: string | null
  /** Equality filters on filter fields */
  eqFilters: Array<{ field: string; value: unknown }>
}

/**
 * Document with search score.
 */
export interface ScoredDocument<T = Record<string, unknown>> {
  document: T
  _score: number
}

// ============================================================================
// Search Index Registry
// ============================================================================

/**
 * Registry of known search indexes.
 * In a real implementation, this would be populated from schema definitions.
 */
const searchIndexRegistry: Map<string, SearchIndexConfig> = new Map([
  ['search_content', {
    name: 'search_content',
    searchField: 'content',
    filterFields: ['category', 'status'],
  }],
  ['search_body', {
    name: 'search_body',
    searchField: 'body',
    filterFields: ['category', 'status'],
  }],
  ['search_products', {
    name: 'search_products',
    searchField: 'description',
    filterFields: ['category', 'brand'],
  }],
  ['search_messages', {
    name: 'search_messages',
    searchField: 'content',
    filterFields: ['channelId', 'authorId'],
  }],
  ['search_docs', {
    name: 'search_docs',
    searchField: 'content',
    filterFields: ['version'],
  }],
])

/**
 * Get search index configuration by name.
 */
export function getSearchIndex(indexName: string): SearchIndexConfig | undefined {
  return searchIndexRegistry.get(indexName)
}

// ============================================================================
// Search Filter Builder Implementation
// ============================================================================

/**
 * Implementation of SearchFilterBuilder.
 *
 * Accumulates search conditions for later execution.
 */
export class SearchFilterBuilderImpl implements SearchFilterBuilder {
  private state: SearchFilterState = {
    searchField: null,
    searchQuery: null,
    eqFilters: [],
  }

  private indexConfig: SearchIndexConfig | null = null

  /**
   * Set the index configuration for validation.
   */
  setIndexConfig(config: SearchIndexConfig): void {
    this.indexConfig = config
  }

  /**
   * Adds a full-text search condition.
   */
  search(field: string, query: string): SearchFilterBuilder {
    // Validate field matches the search index configuration
    if (this.indexConfig && field !== this.indexConfig.searchField) {
      throw new Error(`Field '${field}' is not the search field for this index. Expected '${this.indexConfig.searchField}'.`)
    }
    this.state.searchField = field
    this.state.searchQuery = query
    return this
  }

  /**
   * Adds an equality filter condition.
   */
  eq(field: string, value: unknown): SearchFilterBuilder {
    // Validate field is a filter field
    if (this.indexConfig && !this.indexConfig.filterFields.includes(field)) {
      throw new Error(`Field '${field}' is not a filter field for this index. Available filter fields: ${this.indexConfig.filterFields.join(', ')}`)
    }
    this.state.eqFilters.push({ field, value })
    return this
  }

  /**
   * Get the accumulated filter state.
   */
  getState(): SearchFilterState {
    return this.state
  }
}

// ============================================================================
// Tokenization
// ============================================================================

/**
 * Tokenize text into searchable terms.
 *
 * - Converts to lowercase
 * - Splits on whitespace and punctuation
 * - Filters out empty tokens
 */
export function tokenize(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return []
  }

  // Convert to lowercase and split on non-alphanumeric characters
  // But preserve special characters like C++, C#
  const normalized = text.toLowerCase()

  // Split on whitespace and common punctuation, but preserve some special chars
  const tokens = normalized
    .split(/[\s,.:;!?()\[\]{}'"]+/)
    .filter(token => token.length > 0)

  return tokens
}

/**
 * Parse search query into terms and phrases.
 *
 * Supports:
 * - Individual terms: "hello world" -> ["hello", "world"]
 * - Quoted phrases: '"exact phrase"' -> ["exact phrase"]
 */
export function parseSearchQuery(query: string): { terms: string[]; phrases: string[] } {
  const phrases: string[] = []
  let remaining = query

  // Extract quoted phrases
  const phraseRegex = /"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = phraseRegex.exec(query)) !== null) {
    phrases.push(match[1].toLowerCase())
    remaining = remaining.replace(match[0], '')
  }

  // Tokenize remaining text as individual terms
  const terms = tokenize(remaining)

  return { terms, phrases }
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

/**
 * Calculate Levenshtein edit distance between two strings.
 */
export function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Check if a term fuzzy-matches any token in the document.
 *
 * Uses edit distance with threshold based on term length.
 */
export function fuzzyMatch(searchTerm: string, documentTokens: string[]): { matched: boolean; bestScore: number } {
  const searchLower = searchTerm.toLowerCase()

  // Calculate max allowed edit distance based on term length
  // Short words (< 4 chars): exact match only
  // Medium words (4-6 chars): 1 edit
  // Long words (> 6 chars): 2 edits
  const maxDistance =
    searchLower.length < 4 ? 0 :
    searchLower.length <= 6 ? 1 : 2

  let bestScore = 0

  for (const token of documentTokens) {
    // Exact match
    if (token === searchLower) {
      return { matched: true, bestScore: 1.0 }
    }

    // Prefix match
    if (token.startsWith(searchLower)) {
      const prefixScore = searchLower.length / token.length
      bestScore = Math.max(bestScore, prefixScore * 0.9)
    }

    // Fuzzy match
    if (maxDistance > 0) {
      const distance = editDistance(searchLower, token)
      if (distance <= maxDistance) {
        // Score decreases with edit distance
        const fuzzyScore = 1 - (distance / Math.max(searchLower.length, token.length))
        bestScore = Math.max(bestScore, fuzzyScore * 0.8)
      }
    }
  }

  return { matched: bestScore > 0, bestScore }
}

// ============================================================================
// Relevance Scoring
// ============================================================================

/**
 * Calculate relevance score for a document given a search query.
 *
 * Scoring factors:
 * - Term frequency (TF): Higher frequency = higher score
 * - Term position: Earlier matches get bonus
 * - Exact match bonus
 * - Multiple term bonus
 * - Phrase match bonus
 */
export function calculateRelevanceScore(
  documentText: string,
  searchTerms: string[],
  searchPhrases: string[]
): number {
  if (!documentText || typeof documentText !== 'string') {
    return 0
  }

  const docLower = documentText.toLowerCase()
  const docTokens = tokenize(documentText)

  if (docTokens.length === 0) {
    return 0
  }

  let totalScore = 0
  let matchedTerms = 0

  // Score individual terms
  for (const term of searchTerms) {
    const termLower = term.toLowerCase()

    // Count occurrences (term frequency)
    let termCount = 0
    let firstPosition = -1

    for (let i = 0; i < docTokens.length; i++) {
      const token = docTokens[i]

      // Exact match
      if (token === termLower) {
        termCount++
        if (firstPosition === -1) firstPosition = i
      }
      // Prefix match
      else if (token.startsWith(termLower)) {
        termCount += 0.7
        if (firstPosition === -1) firstPosition = i
      }
      // Fuzzy match (check this last, most expensive)
      else {
        const { matched, bestScore } = fuzzyMatch(term, [token])
        if (matched) {
          termCount += bestScore
          if (firstPosition === -1) firstPosition = i
        }
      }
    }

    if (termCount > 0) {
      matchedTerms++

      // Term frequency score (logarithmic to prevent over-weighting)
      const tfScore = 1 + Math.log(termCount)

      // Position bonus (earlier matches get bonus, max 0.5)
      const positionBonus = firstPosition >= 0 ? 0.5 * (1 - firstPosition / docTokens.length) : 0

      totalScore += tfScore + positionBonus
    }
  }

  // Bonus for matching multiple search terms
  if (searchTerms.length > 1 && matchedTerms > 1) {
    const multiTermBonus = 0.3 * (matchedTerms / searchTerms.length)
    totalScore += multiTermBonus
  }

  // Score phrases (exact consecutive matches)
  for (const phrase of searchPhrases) {
    if (docLower.includes(phrase)) {
      // Big bonus for phrase matches
      totalScore += 2.0
    }
  }

  return totalScore
}

// ============================================================================
// Search Execution
// ============================================================================

/**
 * Execute a full-text search on a collection of documents.
 *
 * @param documents - The documents to search
 * @param searchState - The search configuration
 * @param indexConfig - The search index configuration
 * @returns Scored and filtered documents
 */
export function executeSearch<T extends Record<string, unknown>>(
  documents: T[],
  searchState: SearchFilterState,
  indexConfig: SearchIndexConfig
): ScoredDocument<T>[] {
  // Validate search query
  const query = searchState.searchQuery
  if (!query || query.trim() === '') {
    throw new Error('Empty search query is not allowed. Please provide a search term.')
  }

  const searchField = searchState.searchField || indexConfig.searchField

  // Validate search field
  if (searchField !== indexConfig.searchField) {
    throw new Error(`Field '${searchField}' is not found in search index. Expected '${indexConfig.searchField}'.`)
  }

  // Parse the search query
  const { terms, phrases } = parseSearchQuery(query)

  if (terms.length === 0 && phrases.length === 0) {
    throw new Error('Invalid search query. No valid search terms found.')
  }

  const results: ScoredDocument<T>[] = []

  for (const doc of documents) {
    // Apply equality filters first
    let passesFilters = true
    for (const filter of searchState.eqFilters) {
      if (doc[filter.field] !== filter.value) {
        passesFilters = false
        break
      }
    }

    if (!passesFilters) {
      continue
    }

    // Get the text to search
    const text = doc[searchField]
    if (text === null || text === undefined || typeof text !== 'string') {
      continue
    }

    // Calculate relevance score
    const score = calculateRelevanceScore(text, terms, phrases)

    if (score > 0) {
      results.push({
        document: doc,
        _score: score,
      })
    }
  }

  // Sort by relevance score (descending)
  results.sort((a, b) => b._score - a._score)

  return results
}

/**
 * Add _score to documents from search results.
 */
export function addScoresToDocuments<T extends Record<string, unknown>>(
  scoredDocs: ScoredDocument<T>[]
): Array<T & { _score: number }> {
  return scoredDocs.map(({ document, _score }) => ({
    ...document,
    _score,
  }))
}
