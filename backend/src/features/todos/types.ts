import type { z } from 'zod';
import type { createSchema, updateSchema, todoSchema, listQuerySchema } from './validators.js';
import type { PrismaClient, Todo as PrismaTodo } from '../../generated/prisma/client.js';

export type TodoCreate = z.infer<typeof createSchema>;
export type TodoUpdate = z.infer<typeof updateSchema>;
export type Todo = z.infer<typeof todoSchema>;
export type TodoStatus = NonNullable<z.infer<typeof listQuerySchema>['status']>;
export type TodoRecord = PrismaTodo;
export type Database = PrismaClient;
export interface TodoStore {
  list(status?: TodoStatus): Promise<Todo[]>;
  get(id: number): Promise<Todo | null>;
  create(payload: TodoCreate): Promise<Todo>;
  update(id: number, payload: TodoUpdate): Promise<Todo | null>;
  delete(id: number): Promise<boolean>;
}
