import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

/** Регистрация только пользователя (без организации); компания — позже через POST /auth/organizations. */
export class RegisterUserDto {
  @ApiProperty({ example: "owner@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: "SecretPass1" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "Иван" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @ApiProperty({ example: "Иванов" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;
}
