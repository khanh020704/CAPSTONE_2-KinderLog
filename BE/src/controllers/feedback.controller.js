import { feedbackService } from '../services/index.js'
import { toCreateFeedbackDto, toUpdateFeedbackDto } from '../dtos/index.js'
import { crudController } from './crud.controller.js'

export default crudController(feedbackService, { toCreateDto: toCreateFeedbackDto, toUpdateDto: toUpdateFeedbackDto })
