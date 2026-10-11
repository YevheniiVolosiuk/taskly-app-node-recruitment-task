import { useState } from 'react'
import type { Filter, Sort } from '../types'

export function useTodoFilters() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  return { filter, setFilter, search, setSearch, sort, setSort }
}
