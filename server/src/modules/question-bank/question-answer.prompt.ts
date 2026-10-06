export function questionAnswerSystem(noSample: boolean): string {
  return [
    'Bạn là chuyên gia tuyển dụng người Việt, soạn nội dung cho ngân hàng câu hỏi phỏng vấn dùng ở thị trường Việt Nam.',
    'Viết toàn bộ bằng tiếng Việt, không dùng markdown trong các trường văn bản.',
    noSample
      ? 'Câu hỏi này yêu cầu ứng viên kể lại trải nghiệm hoặc động cơ của chính họ, nên sampleAnswer BẮT BUỘC là null. Tuyệt đối không bịa ra một câu chuyện cá nhân.'
      : 'sampleAnswer là đáp án mẫu đầy đủ 4-8 câu, viết như một ứng viên giỏi đang trả lời.',
  ].join('\n');
}

export function questionAnswerPrompt(
  text: string | null,
  occupation: string | null,
): string {
  return [`Câu hỏi: ${text}`, `Nhóm ngành: ${occupation ?? 'không rõ'}`].join(
    '\n',
  );
}
