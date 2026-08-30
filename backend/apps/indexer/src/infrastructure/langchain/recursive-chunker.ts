import { Injectable } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { CHUNK_OVERLAP, CHUNK_SIZE } from '../../models/constants';
import type { IChunker } from '../interfaces/chunker.interface';

// Wraps @langchain/textsplitters' RecursiveCharacterTextSplitter — the one piece of the
// clean/chunk/embed pipeline genuinely worth pulling LangChain in for (no reasonable in-house
// substitute the way cheerio substitutes for @langchain/community's HTML transformer).
@Injectable()
export class RecursiveChunker implements IChunker {
  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  async split(text: string): Promise<string[]> {
    return this.splitter.splitText(text);
  }
}
