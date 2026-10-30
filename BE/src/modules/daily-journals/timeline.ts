/** One moment of a child's day as parents see it (GET /daily-journals/timeline), in the FE's section order. */
export interface TimelineEvent {
  key: 'attendance' | 'learning' | 'meal' | 'sleep' | 'health' | 'emotion' | 'note' | 'classNote';
  time: string | null;
  title: string;
  text: string;
}
