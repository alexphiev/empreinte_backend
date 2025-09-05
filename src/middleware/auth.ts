import { NextFunction, Request, Response } from 'express'
import { ErrorResponse } from '../types'

export const authenticateApiKey = (req: Request, res: Response<ErrorResponse>, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key']
  const expectedKey = process.env.API_SECRET_KEY

  if (!apiKey || apiKey !== expectedKey) {
    console.error('401 - Missing or invalid API key')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}
