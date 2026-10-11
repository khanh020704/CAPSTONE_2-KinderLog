import { Feedback } from '../../models/index.js'
import { toFeedbackResponse } from '../../dtos/feedback.dto.js'
import FeedbackService from '../feedback.service.js'
import { crudServiceImpl } from './crud.service.impl.js'

class FeedbackServiceImpl extends crudServiceImpl(FeedbackService) {
  constructor() {
    super(Feedback, toFeedbackResponse)
  }
}

export default new FeedbackServiceImpl()
