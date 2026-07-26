import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  Public,
  RequirePermission,
  type AuthenticatedUser,
} from '@pugying/core';
import { AccountService } from '@pugying/account-pro/application/services/account.service';
import {
  AccountLoginDto,
  InviteUserDto,
  LeaveTeamDto,
  SelectTeamDto,
  SwitchTeamDto,
} from '@pugying/account-pro/application/dtos';
import { AccountProPermissions } from '@pugying/account-pro/account-pro.permissions';

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: '共享账户登录（可能需要选择团队）' })
  login(@Body() dto: AccountLoginDto) {
    return this.accountService.login(dto);
  }

  @Public()
  @Post('login/select-team')
  @ApiOperation({ summary: '登录第二步：选择团队并发放 JWT' })
  selectTeam(@Body() dto: SelectTeamDto) {
    return this.accountService.selectTeam(dto);
  }

  @Post('switch-team')
  @ApiBearerAuth()
  @ApiOperation({ summary: '切换当前团队并重签 JWT' })
  switchTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchTeamDto,
  ) {
    return this.accountService.switchTeam(user, dto);
  }

  @Post('refresh-claims')
  @ApiBearerAuth()
  @ApiOperation({ summary: '按当前团队重算权限并重签 JWT' })
  refreshClaims(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.refreshClaims(user);
  }

  @Get('my-teams')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前用户已加入的团队' })
  myTeams(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.myTeams(user.id);
  }

  @Post('invite')
  @ApiBearerAuth()
  @RequirePermission(AccountProPermissions.Invite)
  @ApiOperation({ summary: '邀请已有用户加入团队' })
  invite(@Body() dto: InviteUserDto) {
    return this.accountService.invite(dto);
  }

  @Post('leave')
  @ApiBearerAuth()
  @RequirePermission(AccountProPermissions.Leave)
  @ApiOperation({ summary: '离开团队' })
  leave(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LeaveTeamDto,
  ): Promise<void> {
    return this.accountService.leave(user.id, dto);
  }
}
