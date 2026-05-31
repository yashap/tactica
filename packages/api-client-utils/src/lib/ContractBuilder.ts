import { z, type ZodTypeAny } from 'zod'
import { ServerErrorSchema } from './ServerErrorSchema.js'

const AllErrors = {
  400: ServerErrorSchema,
  401: ServerErrorSchema,
  403: ServerErrorSchema,
  404: ServerErrorSchema,
  500: ServerErrorSchema,
} as const

const AllErrorsExcept404 = {
  400: ServerErrorSchema,
  401: ServerErrorSchema,
  403: ServerErrorSchema,
  500: ServerErrorSchema,
} as const

export class ContractBuilder {
  public static buildGetResponses<T extends ZodTypeAny>(successSchema: T) {
    return { 200: successSchema, ...AllErrors }
  }

  public static buildListResponses<T extends ZodTypeAny>(successSchema: T) {
    return { 200: successSchema, ...AllErrorsExcept404 }
  }

  public static buildPostResponses<T extends ZodTypeAny>(successSchema: T) {
    return { 201: successSchema, ...AllErrorsExcept404 }
  }

  public static buildPatchResponses<T extends ZodTypeAny>(successSchema: T) {
    return { 200: successSchema, ...AllErrors }
  }

  public static buildDeleteResponses() {
    return { 204: z.undefined(), ...AllErrors }
  }
}
