import { Injectable } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { CHUNK_OVERLAP, CHUNK_SIZE } from '../../models/constants';
import type { IChunker } from '../interfaces/chunker.interface';

// Wraps @langchain/textsplitters' RecursiveCharacterTextSplitter.
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
