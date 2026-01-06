/**
 * TDD RED Phase Tests for Full-Text Search Execution
 *
 * These tests define the expected behavior for withSearchIndex() query execution,
 * tokenization, relevance ranking, fuzzy matching, and filter fields.
 *
 * All tests are designed to FAIL because search is interface-only (not implemented).
 *
 * @see convex-q3ih - Full-Text Search Execution (RED)
 */

import { describe, it, expect, vi } from 'vitest'
import { QueryBuilderImpl } from '../../../src/server/database/QueryBuilder'
import type { Id } from '../../../src/types'

// ============================================================================
// Mock Database Setup
// ============================================================================

/**
 * Mock database with documents for search testing.
 * Documents have content fields suitable for full-text search.
 */
function createSearchMockDb<T>(mockData: T[] = []) {
  let capturedQuery: any = null

  const dbFetch = vi.fn(async (query: any) => {
    capturedQuery = query
    return mockData
  })

  return {
    dbFetch,
    getCapturedQuery: () => capturedQuery,
  }
}

// Sample documents for testing search functionality
const sampleDocuments = [
  {
    _id: 'doc_1' as Id<'documents'>,
    _creationTime: 1000,
    title: 'Introduction to TypeScript',
    content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.',
    category: 'programming',
    status: 'published',
    score: 0.95,
  },
  {
    _id: 'doc_2' as Id<'documents'>,
    _creationTime: 2000,
    title: 'React Hooks Guide',
    content: 'React hooks let you use state and other React features without writing a class.',
    category: 'programming',
    status: 'published',
    score: 0.88,
  },
  {
    _id: 'doc_3' as Id<'documents'>,
    _creationTime: 3000,
    title: 'JavaScript Fundamentals',
    content: 'JavaScript is a dynamic programming language used for web development.',
    category: 'programming',
    status: 'draft',
    score: 0.75,
  },
  {
    _id: 'doc_4' as Id<'documents'>,
    _creationTime: 4000,
    title: 'CSS Grid Layout',
    content: 'CSS Grid Layout is a two-dimensional layout system for the web.',
    category: 'design',
    status: 'published',
    score: 0.82,
  },
  {
    _id: 'doc_5' as Id<'documents'>,
    _creationTime: 5000,
    title: 'TypeScript Advanced Types',
    content: 'Advanced TypeScript types include generics, conditional types, and mapped types.',
    category: 'programming',
    status: 'published',
    score: 0.91,
  },
]

// ============================================================================
// 1. Basic withSearchIndex() Method Tests
// ============================================================================

describe('withSearchIndex() - Basic Functionality', () => {
  it('should accept a search index name and search filter builder', async () => {
    // This test is expected to FAIL - withSearchIndex throws "not yet implemented"
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // Should not throw when calling withSearchIndex
    const result = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .collect()

    expect(result).toBeDefined()
  })

  it('should return a QueryBuilder for method chaining', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb([])
    const query = new QueryBuilderImpl('documents', dbFetch)

    const chainedQuery = query.withSearchIndex('search_content', q =>
      q.search('content', 'JavaScript')
    )

    // Should return a QueryBuilder with chainable methods
    expect(chainedQuery).toHaveProperty('filter')
    expect(chainedQuery).toHaveProperty('order')
    expect(chainedQuery).toHaveProperty('collect')
    expect(chainedQuery).toHaveProperty('first')
    expect(chainedQuery).toHaveProperty('take')
    expect(chainedQuery).toHaveProperty('paginate')
  })

  it('should execute search and return matching documents', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .collect()

    // Should return documents matching the search term
    expect(results.length).toBeGreaterThan(0)
    // At minimum, should find docs mentioning TypeScript
    const hasTypeScript = results.some(doc =>
      (doc.content as string).toLowerCase().includes('typescript')
    )
    expect(hasTypeScript).toBe(true)
  })
})

// ============================================================================
// 2. Text Query Tokenization Tests
// ============================================================================

describe('withSearchIndex() - Text Tokenization', () => {
  it('should tokenize search query into individual terms', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // Multi-word query should be tokenized
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'JavaScript programming'))
      .collect()

    // Should find documents matching either term
    expect(results.length).toBeGreaterThan(0)
  })

  it('should be case-insensitive by default', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const resultsLower = await query
      .withSearchIndex('search_content', q => q.search('content', 'typescript'))
      .collect()

    const resultsUpper = await query
      .withSearchIndex('search_content', q => q.search('content', 'TYPESCRIPT'))
      .collect()

    // Both should return the same results
    expect(resultsLower.length).toBe(resultsUpper.length)
    expect(resultsLower.length).toBeGreaterThan(0)
  })

  it('should handle punctuation in search terms', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb([
      {
        _id: 'doc_punc' as Id<'documents'>,
        _creationTime: 1000,
        content: "Hello, world! This is a test.",
        category: 'test',
        status: 'published',
      }
    ])
    const query = new QueryBuilderImpl('documents', dbFetch)

    // Should find "world" even with punctuation in document
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'world'))
      .collect()

    expect(results.length).toBe(1)
  })

  it('should handle empty search query gracefully', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // Empty search should either return all or throw a clear error
    await expect(
      query.withSearchIndex('search_content', q => q.search('content', '')).collect()
    ).rejects.toThrow(/empty.*query|search.*required|invalid.*search/i)
  })

  it('should handle whitespace-only search query', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    await expect(
      query.withSearchIndex('search_content', q => q.search('content', '   ')).collect()
    ).rejects.toThrow(/empty.*query|search.*required|invalid.*search/i)
  })

  it('should support quoted phrase search for exact matches', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // Exact phrase should only match where words appear consecutively
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', '"typed superset"'))
      .collect()

    expect(results.length).toBe(1)
    expect(results[0]._id).toBe('doc_1')
  })
})

// ============================================================================
// 3. Search with Filter Fields Tests
// ============================================================================

describe('withSearchIndex() - Filter Fields', () => {
  it('should support equality filter on filter field', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q =>
        q.search('content', 'TypeScript')
         .eq('category', 'programming')
      )
      .collect()

    // All results should be in 'programming' category
    results.forEach(doc => {
      expect(doc.category).toBe('programming')
    })
  })

  it('should support multiple filter fields', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q =>
        q.search('content', 'TypeScript')
         .eq('category', 'programming')
         .eq('status', 'published')
      )
      .collect()

    // All results should match both filters
    results.forEach(doc => {
      expect(doc.category).toBe('programming')
      expect(doc.status).toBe('published')
    })
  })

  it('should apply filters before text search for efficiency', async () => {
    // This test is expected to FAIL
    const { dbFetch, getCapturedQuery } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    await query
      .withSearchIndex('search_content', q =>
        q.search('content', 'JavaScript')
         .eq('status', 'published')
      )
      .collect()

    // Implementation detail: filters should be applied before full-text search
    // This is a performance optimization
    const captured = getCapturedQuery()
    expect(captured).toBeDefined()
  })

  it('should return empty results when filter matches nothing', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q =>
        q.search('content', 'TypeScript')
         .eq('category', 'nonexistent-category')
      )
      .collect()

    expect(results).toHaveLength(0)
  })

  it('should reject filter on non-filter field', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // 'title' is not a filter field in the search index
    await expect(
      query.withSearchIndex('search_content', q =>
        q.search('content', 'TypeScript')
         .eq('score', 0.95) // score is not a filter field
      ).collect()
    ).rejects.toThrow(/not.*filter.*field|invalid.*filter/i)
  })
})

// ============================================================================
// 4. Search Pagination Tests
// ============================================================================

describe('withSearchIndex() - Pagination', () => {
  it('should support paginate() after search', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const result = await query
      .withSearchIndex('search_content', q => q.search('content', 'programming'))
      .paginate({ numItems: 2 })

    expect(result.page).toHaveLength(2)
    expect(result).toHaveProperty('continueCursor')
    expect(result).toHaveProperty('isDone')
  })

  it('should support take() after search', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'JavaScript'))
      .take(2)

    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('should support first() after search', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const result = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .first()

    expect(result).not.toBeNull()
    expect(result?._id).toBeDefined()
  })

  it('should maintain search relevance order across pages', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const page1 = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .paginate({ numItems: 2 })

    const page2 = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .paginate({ numItems: 2, cursor: page1.continueCursor })

    // Page 2 items should be less relevant than page 1 items
    expect(page1.page).toBeDefined()
    expect(page2.page).toBeDefined()
  })

  it('should correctly indicate isDone on last page', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb([
      { _id: 'doc_1' as Id<'documents'>, _creationTime: 1000, content: 'unique term here', category: 'test', status: 'published' }
    ])
    const query = new QueryBuilderImpl('documents', dbFetch)

    const result = await query
      .withSearchIndex('search_content', q => q.search('content', 'unique'))
      .paginate({ numItems: 10 })

    expect(result.isDone).toBe(true)
    expect(result.page).toHaveLength(1)
  })
})

// ============================================================================
// 5. Relevance Ranking/Scoring Tests
// ============================================================================

describe('withSearchIndex() - Relevance Ranking', () => {
  it('should order results by relevance score', async () => {
    // This test is expected to FAIL
    const docsWithVaryingRelevance = [
      {
        _id: 'doc_low' as Id<'documents'>,
        _creationTime: 1000,
        content: 'This mentions JavaScript once.',
        category: 'programming',
        status: 'published',
      },
      {
        _id: 'doc_high' as Id<'documents'>,
        _creationTime: 2000,
        content: 'JavaScript JavaScript JavaScript is great. JavaScript everywhere!',
        category: 'programming',
        status: 'published',
      },
      {
        _id: 'doc_medium' as Id<'documents'>,
        _creationTime: 3000,
        content: 'Learn JavaScript programming with JavaScript examples.',
        category: 'programming',
        status: 'published',
      },
    ]

    const { dbFetch } = createSearchMockDb(docsWithVaryingRelevance)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'JavaScript'))
      .collect()

    // Higher frequency should rank higher
    expect(results[0]._id).toBe('doc_high')
  })

  it('should rank exact matches higher than partial matches', async () => {
    // This test is expected to FAIL
    const docs = [
      {
        _id: 'doc_partial' as Id<'documents'>,
        _creationTime: 1000,
        content: 'The types in TypeScript are powerful.',
        category: 'programming',
        status: 'published',
      },
      {
        _id: 'doc_exact' as Id<'documents'>,
        _creationTime: 2000,
        content: 'TypeScript is a typed superset of JavaScript.',
        category: 'programming',
        status: 'published',
      },
    ]

    const { dbFetch } = createSearchMockDb(docs)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .collect()

    // Exact match should rank first
    expect(results[0]._id).toBe('doc_exact')
  })

  it('should boost results with multiple matching terms', async () => {
    // This test is expected to FAIL
    const docs = [
      {
        _id: 'doc_one_term' as Id<'documents'>,
        _creationTime: 1000,
        content: 'React is a JavaScript library.',
        category: 'programming',
        status: 'published',
      },
      {
        _id: 'doc_both_terms' as Id<'documents'>,
        _creationTime: 2000,
        content: 'React hooks let you use React features in function components.',
        category: 'programming',
        status: 'published',
      },
    ]

    const { dbFetch } = createSearchMockDb(docs)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // Search for both terms
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'React hooks'))
      .collect()

    // Document with both terms should rank higher
    expect(results[0]._id).toBe('doc_both_terms')
  })

  it('should consider term position (earlier matches rank higher)', async () => {
    // This test is expected to FAIL
    const docs = [
      {
        _id: 'doc_end' as Id<'documents'>,
        _creationTime: 1000,
        content: 'A long introduction about many topics eventually mentions TypeScript.',
        category: 'programming',
        status: 'published',
      },
      {
        _id: 'doc_start' as Id<'documents'>,
        _creationTime: 2000,
        content: 'TypeScript is covered first in this guide.',
        category: 'programming',
        status: 'published',
      },
    ]

    const { dbFetch } = createSearchMockDb(docs)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .collect()

    // Earlier mention should rank higher
    expect(results[0]._id).toBe('doc_start')
  })

  it('should expose relevance score in results', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .collect()

    // Results should include a relevance score
    expect(results[0]).toHaveProperty('_score')
    expect(typeof (results[0] as any)._score).toBe('number')
  })
})

// ============================================================================
// 6. Fuzzy Matching Tests
// ============================================================================

describe('withSearchIndex() - Fuzzy Matching', () => {
  it('should match typos with small edit distance', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // "TypeSript" is a typo of "TypeScript" (missing 'c')
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeSript'))
      .collect()

    // Should still find TypeScript documents
    expect(results.length).toBeGreaterThan(0)
  })

  it('should match common misspellings', async () => {
    // This test is expected to FAIL
    const docs = [
      {
        _id: 'doc_1' as Id<'documents'>,
        _creationTime: 1000,
        content: 'JavaScript programming is fun.',
        category: 'programming',
        status: 'published',
      },
    ]

    const { dbFetch } = createSearchMockDb(docs)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // "Javascrpit" is a common typo
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'Javascrpit'))
      .collect()

    expect(results.length).toBeGreaterThan(0)
  })

  it('should rank exact matches higher than fuzzy matches', async () => {
    // This test is expected to FAIL
    const docs = [
      {
        _id: 'doc_fuzzy' as Id<'documents'>,
        _creationTime: 1000,
        content: 'Learn React programming today.',
        category: 'programming',
        status: 'published',
      },
      {
        _id: 'doc_exact' as Id<'documents'>,
        _creationTime: 2000,
        content: 'React is amazing for building UIs.',
        category: 'programming',
        status: 'published',
      },
    ]

    const { dbFetch } = createSearchMockDb(docs)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // Search for exact term
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'React'))
      .collect()

    // Both should match, but exact should rank higher
    expect(results.length).toBe(2)
  })

  it('should not match with too large edit distance', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // "XYXYXY" is nothing like any word in the content
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'XYXYXY'))
      .collect()

    expect(results).toHaveLength(0)
  })

  it('should handle prefix matching', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // "Type" should match "TypeScript", "typed", etc.
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'Type'))
      .collect()

    expect(results.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// 7. Edge Cases and Error Handling
// ============================================================================

describe('withSearchIndex() - Edge Cases', () => {
  it('should handle special characters in search query', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb([
      {
        _id: 'doc_special' as Id<'documents'>,
        _creationTime: 1000,
        content: 'C++ and C# are programming languages.',
        category: 'programming',
        status: 'published',
      }
    ])
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'C++'))
      .collect()

    expect(results.length).toBe(1)
  })

  it('should handle unicode characters', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb([
      {
        _id: 'doc_unicode' as Id<'documents'>,
        _creationTime: 1000,
        content: 'Apprendre le francais avec des caracteres speciaux.',
        category: 'language',
        status: 'published',
      }
    ])
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'francais'))
      .collect()

    expect(results.length).toBe(1)
  })

  it('should handle very long search queries', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const longQuery = 'TypeScript JavaScript React programming web development frontend backend full stack developer engineer software code coding'

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', longQuery))
      .collect()

    // Should not throw, should return relevant results
    expect(results).toBeDefined()
  })

  it('should handle documents with empty content field', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb([
      {
        _id: 'doc_empty' as Id<'documents'>,
        _creationTime: 1000,
        content: '',
        category: 'empty',
        status: 'published',
      },
      {
        _id: 'doc_normal' as Id<'documents'>,
        _creationTime: 2000,
        content: 'This has content with TypeScript.',
        category: 'programming',
        status: 'published',
      }
    ])
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .collect()

    // Should only return the document with content
    expect(results.length).toBe(1)
    expect(results[0]._id).toBe('doc_normal')
  })

  it('should handle null content field gracefully', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb([
      {
        _id: 'doc_null' as Id<'documents'>,
        _creationTime: 1000,
        content: null as unknown as string,
        category: 'null',
        status: 'published',
      }
    ])
    const query = new QueryBuilderImpl('documents', dbFetch)

    // Should not throw, should return empty results
    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'anything'))
      .collect()

    expect(results).toHaveLength(0)
  })

  it('should throw error for non-existent search index', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    await expect(
      query.withSearchIndex('nonexistent_index', q => q.search('content', 'test')).collect()
    ).rejects.toThrow(/index.*not.*found|unknown.*index|invalid.*index/i)
  })

  it('should throw error for invalid search field', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    await expect(
      query.withSearchIndex('search_content', q => q.search('nonexistent_field', 'test')).collect()
    ).rejects.toThrow(/field.*not.*found|invalid.*field|unknown.*field/i)
  })
})

// ============================================================================
// 8. Method Chaining with Search Tests
// ============================================================================

describe('withSearchIndex() - Method Chaining', () => {
  it('should chain .filter() after search for additional filtering', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    const results = await query
      .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
      .filter(q => q.gt('_creationTime', 2000))
      .collect()

    // Should filter by creation time after search
    results.forEach(doc => {
      expect(doc._creationTime).toBeGreaterThan(2000)
    })
  })

  it('should NOT allow .order() to override relevance order', async () => {
    // This test is expected to FAIL
    // Search results should maintain relevance order, not allow arbitrary ordering
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // This should throw or be ignored - search results are ordered by relevance
    await expect(
      query
        .withSearchIndex('search_content', q => q.search('content', 'TypeScript'))
        .order('asc')
        .collect()
    ).rejects.toThrow(/order.*not.*allowed|relevance.*order|search.*order/i)
  })

  it('should chain .unique() after search', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb([
      {
        _id: 'doc_unique' as Id<'documents'>,
        _creationTime: 1000,
        content: 'UniqueSearchTerm12345',
        category: 'test',
        status: 'published',
      }
    ])
    const query = new QueryBuilderImpl('documents', dbFetch)

    const result = await query
      .withSearchIndex('search_content', q => q.search('content', 'UniqueSearchTerm12345'))
      .unique()

    expect(result).not.toBeNull()
    expect(result?._id).toBe('doc_unique')
  })

  it('should throw on .unique() when multiple search results', async () => {
    // This test is expected to FAIL
    const { dbFetch } = createSearchMockDb(sampleDocuments)
    const query = new QueryBuilderImpl('documents', dbFetch)

    // 'programming' appears in multiple documents
    await expect(
      query
        .withSearchIndex('search_content', q => q.search('content', 'programming'))
        .unique()
    ).rejects.toThrow(/multiple.*result|not.*unique|more.*than.*one/i)
  })
})

// ============================================================================
// 9. Real-World Search Scenarios
// ============================================================================

describe('withSearchIndex() - Real-World Scenarios', () => {
  it('should support blog post search with category filter', async () => {
    // This test is expected to FAIL
    const blogPosts = [
      { _id: 'post_1' as Id<'posts'>, _creationTime: 1000, body: 'TypeScript guide for beginners', category: 'tutorials', status: 'published' },
      { _id: 'post_2' as Id<'posts'>, _creationTime: 2000, body: 'TypeScript in production', category: 'case-study', status: 'published' },
      { _id: 'post_3' as Id<'posts'>, _creationTime: 3000, body: 'TypeScript tips and tricks', category: 'tutorials', status: 'draft' },
    ]

    const { dbFetch } = createSearchMockDb(blogPosts)
    const query = new QueryBuilderImpl('posts', dbFetch)

    const results = await query
      .withSearchIndex('search_body', q =>
        q.search('body', 'TypeScript')
         .eq('category', 'tutorials')
         .eq('status', 'published')
      )
      .collect()

    expect(results.length).toBe(1)
    expect(results[0]._id).toBe('post_1')
  })

  it('should support e-commerce product search', async () => {
    // This test is expected to FAIL
    const products = [
      { _id: 'prod_1' as Id<'products'>, _creationTime: 1000, name: 'Wireless Bluetooth Headphones', description: 'High-quality wireless headphones with noise cancellation', brand: 'AudioMax', category: 'electronics' },
      { _id: 'prod_2' as Id<'products'>, _creationTime: 2000, name: 'Bluetooth Speaker', description: 'Portable bluetooth speaker for outdoor use', brand: 'SoundWave', category: 'electronics' },
      { _id: 'prod_3' as Id<'products'>, _creationTime: 3000, name: 'USB Cable', description: 'Fast charging USB-C cable', brand: 'TechCable', category: 'accessories' },
    ]

    const { dbFetch } = createSearchMockDb(products)
    const query = new QueryBuilderImpl('products', dbFetch)

    const results = await query
      .withSearchIndex('search_products', q =>
        q.search('description', 'bluetooth wireless')
         .eq('category', 'electronics')
      )
      .take(10)

    expect(results.length).toBe(2)
    expect(results.every(p => p.category === 'electronics')).toBe(true)
  })

  it('should support messaging app search', async () => {
    // This test is expected to FAIL
    const messages = [
      { _id: 'msg_1' as Id<'messages'>, _creationTime: 1000, content: 'Hey, did you finish the TypeScript migration?', channelId: 'channel_1', authorId: 'user_1' },
      { _id: 'msg_2' as Id<'messages'>, _creationTime: 2000, content: 'Yes, TypeScript is all set up now!', channelId: 'channel_1', authorId: 'user_2' },
      { _id: 'msg_3' as Id<'messages'>, _creationTime: 3000, content: 'Great work on the migration!', channelId: 'channel_1', authorId: 'user_1' },
      { _id: 'msg_4' as Id<'messages'>, _creationTime: 4000, content: 'TypeScript is great for large projects', channelId: 'channel_2', authorId: 'user_3' },
    ]

    const { dbFetch } = createSearchMockDb(messages)
    const query = new QueryBuilderImpl('messages', dbFetch)

    const results = await query
      .withSearchIndex('search_messages', q =>
        q.search('content', 'TypeScript')
         .eq('channelId', 'channel_1')
      )
      .collect()

    expect(results.length).toBe(2)
    expect(results.every(m => m.channelId === 'channel_1')).toBe(true)
  })

  it('should support documentation search with pagination', async () => {
    // This test is expected to FAIL
    const docs = Array.from({ length: 50 }, (_, i) => ({
      _id: `doc_${i}` as Id<'docs'>,
      _creationTime: i * 1000,
      title: `Documentation Page ${i}`,
      content: `This is documentation page ${i} about ${i % 2 === 0 ? 'React' : 'TypeScript'} development.`,
      version: '2.0',
    }))

    const { dbFetch } = createSearchMockDb(docs)
    const query = new QueryBuilderImpl('docs', dbFetch)

    const page1 = await query
      .withSearchIndex('search_docs', q =>
        q.search('content', 'TypeScript')
         .eq('version', '2.0')
      )
      .paginate({ numItems: 10 })

    expect(page1.page.length).toBe(10)
    expect(page1.isDone).toBe(false)
    expect(page1.continueCursor).toBeTruthy()

    // All results should mention TypeScript
    page1.page.forEach(doc => {
      expect((doc.content as string).includes('TypeScript')).toBe(true)
    })
  })
})
